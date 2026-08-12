'use client';

import type { Capsule, PatchCapsuleRequest } from '@tc/contracts';
import {
  decryptBytes,
  encodeCapsuleKeyForLink,
  encryptBytes,
  generateCapsuleKey,
  unwrapCapsuleKeyForOwner,
  wrapCapsuleKeyForOwner,
  wrapCapsuleKeyWithPassphrase,
} from '@tc/crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from './analytics';
import { ApiClientError, capsulesApi, recipientsApi } from './api-client';
import { decodeIvCiphertext, encodeIvCiphertext } from './capsule-crypto';
import { useMasterKey } from './master-key-context';

import { emptyEnvelope, readEnvelope } from './letter-envelope';

/**
 * `contentDoc` holds a `LetterEnvelope` — the TipTap document plus anything
 * else that is *content* and therefore has to be encrypted with it, currently
 * place-as-memory. Capsules written before V2 hold a bare document here;
 * `readEnvelope` accepts both, so there is nothing to migrate.
 */
const EMPTY_DOC = emptyEnvelope();

function draftCacheKey(capsuleId: string): string {
  return `tc:draft:${capsuleId}`;
}

interface DraftCache {
  contentDoc: unknown;
  patch: PatchCapsuleRequest;
  savedAt: string;
}

function readCache(capsuleId: string): DraftCache | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(draftCacheKey(capsuleId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraftCache;
  } catch {
    return null;
  }
}

function writeCache(capsuleId: string, cache: DraftCache): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(draftCacheKey(capsuleId), JSON.stringify(cache));
}

function clearCache(capsuleId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(draftCacheKey(capsuleId));
}

/**
 * recipientId -> the one-time raw access token returned by `POST
 * .../recipients` — the server hashes it at rest and never returns the raw
 * form again (T-09 decisions log), so the *only* copy that will ever exist
 * anywhere is whatever the browser is holding right after creation. This
 * used to live only in a `useRef` Map, deliberately never persisted — but
 * "never persisted" meant a reload between adding a recipient and sealing
 * silently and permanently lost the ability to notify them at all: not just
 * at seal time, but forever, since `resendInvite` also needs a raw token to
 * build its link from. Persisting it client-side is the same accepted
 * tradeoff `lib/guest-store.ts` already makes for the guest capsule key
 * (documented there as "no way around this... an accepted tradeoff") — a
 * *different* keyspace from the content-draft cache above, because that one
 * is cleared after every successful autosave (line ~220 below) and a
 * recipient token needs to survive from "added" all the way to "announced,"
 * which spans many autosave cycles.
 */
function recipientTokensCacheKey(capsuleId: string): string {
  return `tc:draft:${capsuleId}:recipient-tokens`;
}

function readRecipientTokens(capsuleId: string): Map<string, string> {
  if (typeof window === 'undefined') return new Map();
  try {
    const raw = localStorage.getItem(recipientTokensCacheKey(capsuleId));
    if (!raw) return new Map();
    return new Map(Object.entries(JSON.parse(raw) as Record<string, string>));
  } catch {
    return new Map();
  }
}

function writeRecipientTokens(capsuleId: string, tokens: Map<string, string>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(recipientTokensCacheKey(capsuleId), JSON.stringify(Object.fromEntries(tokens)));
}

function clearRecipientTokens(capsuleId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(recipientTokensCacheKey(capsuleId));
}

export interface AnnounceResult {
  total: number;
  succeeded: number;
  /** Recipient ids whose announce call failed — surfaced so a caller can say honestly that sealing worked but notifying didn't, rather than implying delivery happened. */
  failedRecipientIds: string[];
}

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'rejected';

export interface CapsuleDraft {
  capsule: Capsule | null;
  contentDoc: unknown;
  loading: boolean;
  /** True once the capsule key is available (unwrapped or freshly generated) — content edits are meaningless until then. */
  ready: boolean;
  autosaveStatus: AutosaveStatus;
  /**
   * Why the last save was refused, when the server refused it on its merits
   * rather than failing to arrive.
   *
   * The distinction matters because the two need opposite advice. A transport
   * failure resolves itself on the next attempt; a rejected value never will,
   * and `pendingPatchRef` keeps re-sending it — so a capsule whose moment had
   * slipped into the past stopped saving the writer's words entirely, while
   * the header cheerfully said "retrying". It self-heals the moment the
   * offending field is changed, because the new value overwrites the pending
   * one; what was missing was any way to know which field to change.
   */
  saveRejection: ApiClientError | null;
  /** Merges into local state immediately (cached to localStorage) and queues a debounced encrypted sync. */
  patch: (fields: PatchCapsuleRequest) => void;
  setContentDoc: (doc: unknown) => void;
  /** Flushes any pending autosave immediately — call before seal/navigation. */
  flush: () => Promise<void>;
  /** Encrypts arbitrary bytes (e.g. a media file) under this capsule's key — `iv` prefixed to the returned buffer so the recipient only needs the one blob to decrypt. */
  encryptForCapsule: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Wraps this capsule's key under a passphrase (Passphrase Seal) — base64, safe to send to the server. */
  wrapForPassphrase: (passphrase: string) => Promise<string>;
  /**
   * Remembers a just-created recipient's one-time raw access token — call
   * right after `recipientsApi.create` resolves, while the token is still
   * in hand. Persisted client-side (see `writeRecipientTokens` above) so a
   * reload before sealing doesn't lose the only copy that will ever exist.
   */
  registerRecipientToken: (recipientId: string, accessToken: string) => void;
  /**
   * Builds and sends the "something is waiting" email for every recipient
   * added this session (via `registerRecipientToken`), immediately after a
   * successful seal. The capsule key never leaves this hook — only the
   * fully-assembled link (built here, client-side) is sent to the server,
   * which drops it into the email unparsed (T-14 decisions log). Resolves
   * with a summary rather than swallowing per-recipient failures, so the
   * seal flow can tell a writer honestly when sealing worked but notifying
   * someone didn't.
   */
  sendAnnounceToAll: (capsuleId: string) => Promise<AnnounceResult>;
}

const AUTOSAVE_IDLE_MS = 3000;

/**
 * Owns a single capsule draft's local state, local-storage crash recovery,
 * and debounced encrypted autosave. Content (contentDoc) is always E2E
 * encrypted client-side before it leaves the browser (06 §A) — the capsule
 * key itself is generated once per capsule and wrapped under the owner's
 * master key, matching the same key already used at seal time (there's no
 * separate "draft key"; drafts and sealed capsules share one capsule key).
 */
export function useCapsuleDraft(capsuleId: string | null): CapsuleDraft {
  const { masterKey } = useMasterKey();
  const [capsule, setCapsule] = useState<Capsule | null>(null);
  const [contentDoc, setContentDocState] = useState<unknown>(EMPTY_DOC);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [saveRejection, setSaveRejection] = useState<ApiClientError | null>(null);

  const capsuleKeyRef = useRef<Uint8Array | null>(null);
  const pendingPatchRef = useRef<PatchCapsuleRequest>({});
  // recipientId -> one-time raw access token, mirrored to localStorage (see
  // readRecipientTokens/writeRecipientTokens above) — the capsule key itself
  // (used to build the `#k=` link fragment) still never leaves this hook and
  // never reaches the server, per T-14's decisions log.
  const recipientTokensRef = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against overlapping autosave requests: without this, a slow
  // in-flight PATCH (e.g. from an earlier radio click) can resolve after a
  // newer one and unconditionally overwrite local state with its stale
  // response, silently reverting fields the user just changed. Chaining
  // behind the current save — then re-running once it clears, to pick up
  // whatever landed in pendingPatchRef meanwhile — keeps requests strictly
  // serialized instead of racing.
  const savePromiseRef = useRef<Promise<void> | null>(null);
  // TipTap's useEditor only binds `onUpdate` once (its options aren't
  // re-read every render), so anything that callback reaches only ever
  // sees whatever closure existed at that first bind. setContentDocState
  // itself is fine (useState setters are always current), but anything
  // derived FROM contentDoc inside a useCallback (runAutosave, cacheLocally)
  // would otherwise close over a stale value forever. Mirroring contentDoc
  // into a ref, updated synchronously alongside the state, sidesteps this —
  // those callbacks read contentDocRef.current instead of the state value.
  const contentDocRef = useRef<unknown>(EMPTY_DOC);
  const contentAddedFiredRef = useRef(false);
  const scheduleSetFiredRef = useRef(false);

  // --- Load + capsule-key bootstrap ---
  useEffect(() => {
    if (!capsuleId || !masterKey) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { capsule: loaded } = await capsulesApi.get(capsuleId);
      if (cancelled) return;

      let capsuleKey: Uint8Array;
      if (loaded.ownerKeyWrap) {
        capsuleKey = await unwrapCapsuleKeyForOwner(loaded.ownerKeyWrap, masterKey);
      } else {
        capsuleKey = generateCapsuleKey();
        const ownerKeyWrap = await wrapCapsuleKeyForOwner(capsuleKey, masterKey);
        const { capsule: patched } = await capsulesApi.patch(capsuleId, { ownerKeyWrap });
        loaded.ownerKeyWrap = patched.ownerKeyWrap;
      }
      capsuleKeyRef.current = capsuleKey;
      recipientTokensRef.current = readRecipientTokens(capsuleId);

      const cached = readCache(capsuleId);
      if (cached) {
        // Local edits always win over the server's last-synced snapshot —
        // this is what makes "refresh mid-edit loses nothing" true even if
        // the 3s autosave debounce hadn't fired yet before the refresh.
        setCapsule({ ...loaded, ...cached.patch });
        contentDocRef.current = cached.contentDoc;
        setContentDocState(cached.contentDoc);
        pendingPatchRef.current = cached.patch;
      } else if (loaded.contentDocEnc) {
        const { iv, ciphertext } = decodeIvCiphertext(loaded.contentDocEnc);
        const plaintext = await decryptBytes(capsuleKey, iv, ciphertext);
        const envelope = readEnvelope(JSON.parse(new TextDecoder().decode(plaintext)));
        setCapsule(loaded);
        contentDocRef.current = envelope;
        setContentDocState(envelope);
      } else {
        setCapsule(loaded);
        contentDocRef.current = EMPTY_DOC;
        setContentDocState(EMPTY_DOC);
      }

      setLoading(false);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [capsuleId, masterKey]);

  const runAutosave = useCallback((): Promise<void> => {
    if (!capsuleId || !capsuleKeyRef.current) return Promise.resolve();
    // A save is already in flight — chain behind it rather than firing a
    // second overlapping request; the in-flight run's own loop below picks
    // up whatever patch() calls arrive while we wait.
    if (savePromiseRef.current) {
      return savePromiseRef.current;
    }

    const run = (async () => {
      let rerun = true;
      while (rerun) {
        rerun = false;
        const patchToSend = pendingPatchRef.current;
        setAutosaveStatus('saving');
        try {
          const doc = new TextEncoder().encode(JSON.stringify(contentDocRef.current));
          const { iv, ciphertext } = await encryptBytes(capsuleKeyRef.current!, doc);
          const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

          const { capsule: updated } = await capsulesApi.patch(capsuleId, { ...patchToSend, contentDocEnc });
          setCapsule(updated);
          // Only clear the fields this request actually sent — anything
          // patch() merged in after we captured patchToSend stays pending
          // for the next iteration rather than being dropped.
          for (const key of Object.keys(patchToSend)) {
            delete (pendingPatchRef.current as Record<string, unknown>)[key];
          }
          clearCache(capsuleId);
          setSaveRejection(null);
          setAutosaveStatus('saved');
          rerun = Object.keys(pendingPatchRef.current).length > 0;
        } catch (err) {
          // 4xx means the server understood and refused. Retrying identical
          // bytes cannot change that answer, so it is not reported as if it
          // could — and the reason is kept so the composer can point at the
          // field that needs changing.
          const refused = err instanceof ApiClientError && err.status >= 400 && err.status < 500;
          setSaveRejection(refused ? (err as ApiClientError) : null);
          setAutosaveStatus(refused ? 'rejected' : 'error');
        }
      }
      savePromiseRef.current = null;
    })();

    savePromiseRef.current = run;
    return run;
  }, [capsuleId]);

  const scheduleAutosave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setAutosaveStatus('pending');
    timerRef.current = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_IDLE_MS);
  }, [runAutosave]);

  const cacheLocally = useCallback(() => {
    if (!capsuleId) return;
    writeCache(capsuleId, { contentDoc: contentDocRef.current, patch: pendingPatchRef.current, savedAt: new Date().toISOString() });
  }, [capsuleId]);

  const patch = useCallback(
    (fields: PatchCapsuleRequest) => {
      if (!scheduleSetFiredRef.current && ('unlockAt' in fields || 'unlockLocal' in fields)) {
        scheduleSetFiredRef.current = true;
        track('schedule_set');
      }
      pendingPatchRef.current = { ...pendingPatchRef.current, ...fields };
      setCapsule((prev) => (prev ? ({ ...prev, ...fields } as Capsule) : prev));
      cacheLocally();
      scheduleAutosave();
    },
    [cacheLocally, scheduleAutosave],
  );

  const setContentDoc = useCallback(
    (doc: unknown) => {
      const written = readEnvelope(doc);
      const isBlank =
        JSON.stringify(written.doc) === JSON.stringify(EMPTY_DOC.doc) && written.writtenAt === null;
      if (!contentAddedFiredRef.current && !isBlank) {
        contentAddedFiredRef.current = true;
        track('content_added');
      }
      contentDocRef.current = doc;
      setContentDocState(doc);
      cacheLocally();
      scheduleAutosave();
    },
    [cacheLocally, scheduleAutosave],
  );

  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await runAutosave();
  }, [runAutosave]);

  const encryptForCapsule = useCallback(async (bytes: Uint8Array) => {
    if (!capsuleKeyRef.current) {
      throw new Error('Capsule key not ready yet');
    }
    const { iv, ciphertext } = await encryptBytes(capsuleKeyRef.current, bytes);
    // Raw bytes here, not base64 — this blob is uploaded as binary (PUT to
    // R2), unlike contentDocEnc which travels inside a JSON PATCH body and
    // therefore needs encodeIvCiphertext's base64 wrapping.
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);
    return combined;
  }, []);

  const wrapForPassphrase = useCallback(async (passphrase: string) => {
    if (!capsuleKeyRef.current) {
      throw new Error('Capsule key not ready yet');
    }
    return wrapCapsuleKeyWithPassphrase(capsuleKeyRef.current, passphrase);
  }, []);

  const registerRecipientToken = useCallback(
    (recipientId: string, accessToken: string) => {
      recipientTokensRef.current.set(recipientId, accessToken);
      if (capsuleId) writeRecipientTokens(capsuleId, recipientTokensRef.current);
    },
    [capsuleId],
  );

  const sendAnnounceToAll = useCallback(
    async (capsuleIdForLink: string): Promise<AnnounceResult> => {
      const entries = Array.from(recipientTokensRef.current.entries());
      if (!capsuleKeyRef.current || entries.length === 0) {
        return { total: 0, succeeded: 0, failedRecipientIds: [] };
      }
      const fragment = encodeCapsuleKeyForLink(capsuleKeyRef.current);
      const results = await Promise.allSettled(
        entries.map(([recipientId, accessToken]) => {
          const link = `${window.location.origin}/c/${accessToken}#${fragment}`;
          return recipientsApi.announce(capsuleIdForLink, recipientId, link);
        }),
      );

      const failedRecipientIds: string[] = [];
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const recipientId = entries[i]![0];
          failedRecipientIds.push(recipientId);
          // Promise.allSettled already stops these from becoming an unhandled
          // rejection, but silently stopping there is what let a real
          // provider/network failure disappear with no trace at all — logged
          // so it's at least visible in the browser console, and returned so
          // the caller (Composer's seal handler) can tell the difference
          // between "sealed and notified" and "sealed, notify failed."
          console.error(`Failed to announce capsule to recipient ${recipientId}:`, result.reason);
        }
      });

      // The tokens have done their one job (or had their one chance) — the
      // capsule is sealed by the time this runs, so nothing else in this
      // composer session will ever call announce for it again.
      if (capsuleIdForLink) clearRecipientTokens(capsuleIdForLink);

      return { total: entries.length, succeeded: entries.length - failedRecipientIds.length, failedRecipientIds };
    },
    [],
  );

  return {
    capsule,
    contentDoc,
    loading,
    ready,
    autosaveStatus,
    saveRejection,
    patch,
    setContentDoc,
    flush,
    encryptForCapsule,
    wrapForPassphrase,
    registerRecipientToken,
    sendAnnounceToAll,
  };
}
