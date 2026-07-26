'use client';

import type { Capsule, PatchCapsuleRequest } from '@tc/contracts';
import {
  decryptBytes,
  encryptBytes,
  generateCapsuleKey,
  unwrapCapsuleKeyForOwner,
  wrapCapsuleKeyForOwner,
  wrapCapsuleKeyWithPassphrase,
} from '@tc/crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { capsulesApi } from './api-client';
import { decodeIvCiphertext, encodeIvCiphertext } from './capsule-crypto';
import { useMasterKey } from './master-key-context';

/** Empty TipTap document — the shape TipTap's JSON export always has at minimum. */
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

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

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface CapsuleDraft {
  capsule: Capsule | null;
  contentDoc: unknown;
  loading: boolean;
  /** True once the capsule key is available (unwrapped or freshly generated) — content edits are meaningless until then. */
  ready: boolean;
  autosaveStatus: AutosaveStatus;
  /** Merges into local state immediately (cached to localStorage) and queues a debounced encrypted sync. */
  patch: (fields: PatchCapsuleRequest) => void;
  setContentDoc: (doc: unknown) => void;
  /** Flushes any pending autosave immediately — call before seal/navigation. */
  flush: () => Promise<void>;
  /** Encrypts arbitrary bytes (e.g. a media file) under this capsule's key — `iv` prefixed to the returned buffer so the recipient only needs the one blob to decrypt. */
  encryptForCapsule: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Wraps this capsule's key under a passphrase (Passphrase Seal) — base64, safe to send to the server. */
  wrapForPassphrase: (passphrase: string) => Promise<string>;
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

  const capsuleKeyRef = useRef<Uint8Array | null>(null);
  const pendingPatchRef = useRef<PatchCapsuleRequest>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // TipTap's useEditor only binds `onUpdate` once (its options aren't
  // re-read every render), so anything that callback reaches only ever
  // sees whatever closure existed at that first bind. setContentDocState
  // itself is fine (useState setters are always current), but anything
  // derived FROM contentDoc inside a useCallback (runAutosave, cacheLocally)
  // would otherwise close over a stale value forever. Mirroring contentDoc
  // into a ref, updated synchronously alongside the state, sidesteps this —
  // those callbacks read contentDocRef.current instead of the state value.
  const contentDocRef = useRef<unknown>(EMPTY_DOC);

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
        const doc = JSON.parse(new TextDecoder().decode(plaintext));
        setCapsule(loaded);
        contentDocRef.current = doc;
        setContentDocState(doc);
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

  const runAutosave = useCallback(async () => {
    if (!capsuleId || !capsuleKeyRef.current) return;
    const patchToSend = pendingPatchRef.current;
    const hasFieldChanges = Object.keys(patchToSend).length > 0;
    setAutosaveStatus('saving');
    try {
      const doc = new TextEncoder().encode(JSON.stringify(contentDocRef.current));
      const { iv, ciphertext } = await encryptBytes(capsuleKeyRef.current, doc);
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

      const { capsule: updated } = await capsulesApi.patch(capsuleId, { ...patchToSend, contentDocEnc });
      setCapsule(updated);
      pendingPatchRef.current = {};
      clearCache(capsuleId);
      setAutosaveStatus('saved');
      void hasFieldChanges;
    } catch {
      setAutosaveStatus('error');
    }
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
      pendingPatchRef.current = { ...pendingPatchRef.current, ...fields };
      setCapsule((prev) => (prev ? ({ ...prev, ...fields } as Capsule) : prev));
      cacheLocally();
      scheduleAutosave();
    },
    [cacheLocally, scheduleAutosave],
  );

  const setContentDoc = useCallback(
    (doc: unknown) => {
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

  return { capsule, contentDoc, loading, ready, autosaveStatus, patch, setContentDoc, flush, encryptForCapsule, wrapForPassphrase };
}
