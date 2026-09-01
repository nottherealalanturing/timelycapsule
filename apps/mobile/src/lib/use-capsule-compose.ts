import type { Capsule, Recipient } from '@tc/contracts';
import { encryptBytes, generateCapsuleKey, wrapCapsuleKeyForOwner } from '@tc/crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, capsulesApi } from './api-client';
import { describeCapsulePatchFailure } from './api-error-copy';
import { useAuth } from './auth-context';
import {
  decryptField,
  emptyEnvelope,
  encodeIvCiphertext,
  encryptMediaForCapsule,
  readEnvelope,
  resolveCapsuleKey,
  textToEnvelope,
  type LetterEnvelope,
} from './capsule-crypto';
import { deleteLocalDraft, loadLocalDraft, saveLocalDraft } from './local-draft-store';
import { useMasterKey } from './master-key-context';

export type ComposeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; capsule: Capsule; recipients: Recipient[]; envelope: LetterEnvelope };

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'rejected';

const AUTOSAVE_IDLE_MS = 3000;

/**
 * Movement II — Compose (E1.4.3, local persistence added E1.4.4). Owns the
 * one thing Address deliberately never touches: the capsule key, and the
 * client-side encryption of the letter under it. Mirrors
 * `apps/web/src/lib/use-capsule-draft.ts`'s real bootstrap/autosave
 * behavior (traced directly, not assumed) rather than inventing a
 * different pipeline:
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
 *  - **Local encrypted draft (E1.4.4)** is a bridge, not a second source of
 *    truth: every `setText` immediately (not debounced — the whole point is
 *    surviving an app kill *before* the 3s server debounce fires) encrypts
 *    the envelope under a device-local draft key (`local-draft-key.ts`,
 *    independent of the master key) and upserts one row per capsule in
 *    `expo-sqlite` (`local-draft-store.ts`). A successful server save
 *    deletes that row — it never accumulates as a permanent second copy of
 *    what the server already holds properly encrypted under the real
 *    master-key-wrapped capsule key. On mount, a local row (meaning a prior
 *    edit never got server-confirmed) wins over whatever the server last
 *    saved, and an immediate save is scheduled to reconcile them — this is
 *    the only "conflict" this product's single-writer model can produce,
 *    since nothing else here ever writes content concurrently. A row that
 *    fails to decrypt (wrong/rotated device key, corrupted write) is
 *    treated exactly like no row at all, never shown as ciphertext or
 *    partial content — see `loadLocalDraft`'s own `corrupted` status.
 *    Unlike web's plaintext `localStorage` mirror (a real, pre-existing,
 *    security-adjacent characteristic of web specifically, recorded not
 *    copied by the E1.4 readiness audit's §9), this is encrypted at rest.
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
  /** Encrypts arbitrary bytes (media, E1.4.7) under this capsule's key — see `encryptMediaForCapsule`'s own header comment for the exact wire format. Throws if called before the capsule key has resolved (the media UI only ever mounts once `state.status === 'ready'`, so this is not reachable in practice). */
  encryptForCapsule: (bytes: Uint8Array) => Promise<Uint8Array>;
} {
  const { masterKey } = useMasterKey();
  const { user } = useAuth();
  const [state, setState] = useState<ComposeState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const capsuleKeyRef = useRef<Uint8Array | null>(null);
  const envelopeRef = useRef<LetterEnvelope>(emptyEnvelope());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const accountIdRef = useRef<string | null>(null);

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
          // The server now has this content properly encrypted under the
          // real capsule key — the local encrypted copy's entire reason to
          // exist (bridging the gap this save just closed) is gone. Best
          // effort: a failure here just leaves a now-redundant row to be
          // cleaned up by the next successful save instead.
          void deleteLocalDraft(id).catch(() => {});
          // Something newer arrived while this request was in flight —
          // encrypt and send it too, rather than dropping it.
          rerun = envelopeRef.current !== toSend;
        } catch (err) {
          // A 4xx means the server understood and refused (e.g. the capsule
          // was sealed elsewhere mid-edit) — retrying identical bytes cannot
          // change that answer, matching web's own `saveRejection` handling.
          setSaveMessage(describeCapsulePatchFailure(err));
          if (err instanceof ApiClientError && err.status >= 400 && err.status < 500) {
            setAutosaveStatus('rejected');
          } else {
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

  // --- Load + capsule-key bootstrap ---
  useEffect(() => {
    if (!masterKey || !user) return;
    const accountId = user.id;
    accountIdRef.current = accountId;
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

        // A local row surviving from a prior edit means that edit was never
        // server-confirmed (the app was killed, or the save failed/was
        // still pending) — it is strictly newer than whatever the server
        // just returned, by construction (nothing else here writes
        // content), so it wins. `resync` schedules an immediate save below
        // once state is set, reconciling the two.
        let resync = false;
        try {
          const local = await loadLocalDraft(accountId, id);
          if (!cancelled && local.status === 'found') {
            envelope = local.envelope;
            resync = true;
          }
        } catch {
          // Local lookup is a resilience feature, not a hard dependency —
          // a failure here (e.g. SQLite unavailable) falls back to
          // whatever the server already returned, silently.
        }

        if (cancelled) return;
        capsuleKeyRef.current = capsuleKey;
        envelopeRef.current = envelope;
        setState({ status: 'ready', capsule: current, recipients, envelope });
        if (resync) scheduleAutosave();
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [id, masterKey, user, attempt, scheduleAutosave]);

  const setText = useCallback(
    (text: string) => {
      const envelope = textToEnvelope(text, envelopeRef.current.writtenAt);
      envelopeRef.current = envelope;
      setState((prev) => (prev.status === 'ready' ? { ...prev, envelope } : prev));
      // Immediate, not debounced — this is the local safety net for the
      // window before the server debounce below ever fires. Fire-and-forget:
      // a local-persistence failure must never block typing or surface as a
      // user-facing error (see local-draft-store.ts's header comment).
      const accountId = accountIdRef.current;
      if (accountId) void saveLocalDraft(accountId, id, envelope).catch(() => {});
      scheduleAutosave();
    },
    [id, scheduleAutosave],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await runAutosave();
  }, [runAutosave]);

  const encryptForCapsule = useCallback(async (bytes: Uint8Array) => {
    if (!capsuleKeyRef.current) {
      throw new Error('Capsule key not ready yet');
    }
    return encryptMediaForCapsule(capsuleKeyRef.current, bytes);
  }, []);

  return { state, retry, autosaveStatus, saveMessage, setText, flush, encryptForCapsule };
}
