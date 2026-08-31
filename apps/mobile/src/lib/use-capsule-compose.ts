import type { Capsule, Recipient } from '@tc/contracts';
import { encryptBytes, generateCapsuleKey, wrapCapsuleKeyForOwner } from '@tc/crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, capsulesApi } from './api-client';
import { decryptField, emptyEnvelope, encodeIvCiphertext, readEnvelope, resolveCapsuleKey, textToEnvelope, type LetterEnvelope } from './capsule-crypto';
import { useMasterKey } from './master-key-context';

export type ComposeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; capsule: Capsule; recipients: Recipient[]; envelope: LetterEnvelope };

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'rejected';

const AUTOSAVE_IDLE_MS = 3000;

/**
 * Movement II — Compose (E1.4.3). Owns the one thing Address deliberately
 * never touches: the capsule key, and the client-side encryption of the
 * letter under it. Mirrors `apps/web/src/lib/use-capsule-draft.ts`'s real
 * bootstrap/autosave behavior (traced directly, not assumed) rather than
 * inventing a different pipeline:
 *
 *  - **Capsule-key bootstrap** happens once, on this hook's mount: unwrap
 *    the existing key if `ownerKeyWrap` is already set (a capsule reopened
 *    after already having a key), or generate one and immediately `PATCH`
 *    its owner-wrap if not (first time Compose is ever opened for this
 *    capsule). Web bootstraps at its single container's mount regardless of
 *    which movement is showing; mobile's separate-screen architecture
 *    (established by E1.4.1) defers this exact same bootstrap until Compose
 *    itself mounts instead — a disclosed adaptation to the per-screen
 *    structure, not a product-semantics change: the end state (a valid,
 *    owner-wrapped capsule key existing before any content is encrypted)
 *    is identical either way, and Address never needs the key for anything.
 *  - **Content autosave is debounced ~3s**, matching web's own
 *    `AUTOSAVE_IDLE_MS`, and serializes overlapping saves by chaining behind
 *    whichever save is already in flight rather than firing a second
 *    overlapping request — the same race web's own `runAutosave` guards
 *    against (a slow save resolving after a newer one would otherwise
 *    silently revert fresher local edits with a stale server response).
 *  - **No local cache of any kind** — not even web's own plaintext
 *    `localStorage` mirror. That mirror is a real, pre-existing,
 *    security-adjacent characteristic of web specifically (recorded, not
 *    copied, by the E1.4 readiness audit's §9) — mobile's own *encrypted*
 *    equivalent is `E1.4.4`'s job, not this ticket's. Until then, a killed
 *    app loses only whatever hasn't cleared the debounce window yet, the
 *    same "a closed tab loses anything not yet autosaved" exposure web's
 *    own online `PATCH` path already has today, independent of its extra
 *    localStorage safety net.
 *  - **`contentDocEnc` is encoded as standard base64** via this file's
 *    sibling `encodeIvCiphertext` (not `@tc/crypto`'s base64url
 *    `toBase64Url`) — see that function's own header comment for why this
 *    is the canonical choice, not merely a tolerated one.
 *  - **Recipients are fetched alongside the capsule**, read-only, purely so
 *    the Compose screen can hold "who this is for" visible while writing —
 *    `apps/web/src/components/composer/v2/AddressHallmark.tsx`'s own stated
 *    reason ("nobody is writing into an abstraction"). This hook never
 *    mutates recipients; add/remove stays exclusively Address's job.
 */
export function useCapsuleCompose(id: string): {
  state: ComposeState;
  retry: () => void;
  autosaveStatus: AutosaveStatus;
  saveMessage: string | null;
  setText: (text: string) => void;
  flush: () => Promise<void>;
} {
  const { masterKey } = useMasterKey();
  const [state, setState] = useState<ComposeState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const capsuleKeyRef = useRef<Uint8Array | null>(null);
  const envelopeRef = useRef<LetterEnvelope>(emptyEnvelope());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);

  // --- Load + capsule-key bootstrap ---
  useEffect(() => {
    if (!masterKey) return;
    let cancelled = false;

    Promise.all([capsulesApi.get(id), capsulesApi.recipients(id)])
      .then(async ([{ capsule }, { data: recipients }]) => {
        if (cancelled) return;

        let capsuleKey: Uint8Array;
        let envelope: LetterEnvelope;
        let current = capsule;

        if (capsule.ownerKeyWrap) {
          const keyResult = await resolveCapsuleKey(capsule.ownerKeyWrap, masterKey);
          if (keyResult.status !== 'ok') throw new Error('capsule key could not be resolved');
          capsuleKey = keyResult.capsuleKey;

          if (capsule.contentDocEnc) {
            const fieldResult = await decryptField(capsuleKey, capsule.contentDocEnc);
            if (fieldResult.status !== 'ok') throw fieldResult.error;
            envelope = readEnvelope(JSON.parse(new TextDecoder().decode(fieldResult.plaintext)));
          } else {
            envelope = emptyEnvelope();
          }
        } else {
          capsuleKey = generateCapsuleKey();
          const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
          const { capsule: patched } = await capsulesApi.patch(id, { ownerKeyWrap });
          current = patched;
          envelope = emptyEnvelope();
        }

        if (cancelled) return;
        capsuleKeyRef.current = capsuleKey;
        envelopeRef.current = envelope;
        setState({ status: 'ready', capsule: current, recipients, envelope });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [id, masterKey, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const runAutosave = useCallback((): Promise<void> => {
    if (!capsuleKeyRef.current) return Promise.resolve();
    // A save is already in flight — chain behind it instead of firing a
    // second overlapping request; its own loop below re-checks for anything
    // newer once it clears.
    if (savePromiseRef.current) return savePromiseRef.current;

    const run = (async () => {
      let rerun = true;
      while (rerun) {
        const toSend = envelopeRef.current;
        setAutosaveStatus('saving');
        try {
          const bytes = new TextEncoder().encode(JSON.stringify(toSend));
          const { iv, ciphertext } = await encryptBytes(capsuleKeyRef.current!, bytes);
          const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

          const { capsule } = await capsulesApi.patch(id, { contentDocEnc });
          setState((prev) => (prev.status === 'ready' ? { ...prev, capsule } : prev));
          setSaveMessage(null);
          setAutosaveStatus('saved');
          // Something newer arrived while this request was in flight —
          // encrypt and send it too, rather than dropping it.
          rerun = envelopeRef.current !== toSend;
        } catch (err) {
          // A 4xx means the server understood and refused (e.g. the capsule
          // was sealed elsewhere mid-edit) — retrying identical bytes cannot
          // change that answer, matching web's own `saveRejection` handling.
          if (err instanceof ApiClientError && err.status >= 400 && err.status < 500) {
            setSaveMessage(
              err.code === 'capsule_sealed' ? 'This capsule has already been sealed and can no longer be edited.' : 'That could not be saved.',
            );
            setAutosaveStatus('rejected');
          } else {
            setSaveMessage("That couldn't be saved. Check your connection and try again.");
            setAutosaveStatus('error');
          }
          rerun = false;
        }
      }
      savePromiseRef.current = null;
    })();

    savePromiseRef.current = run;
    return run;
  }, [id]);

  const scheduleAutosave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAutosaveStatus('pending');
    timerRef.current = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_IDLE_MS);
  }, [runAutosave]);

  const setText = useCallback(
    (text: string) => {
      const envelope = textToEnvelope(text, envelopeRef.current.writtenAt);
      envelopeRef.current = envelope;
      setState((prev) => (prev.status === 'ready' ? { ...prev, envelope } : prev));
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await runAutosave();
  }, [runAutosave]);

  return { state, retry, autosaveStatus, saveMessage, setText, flush };
}
