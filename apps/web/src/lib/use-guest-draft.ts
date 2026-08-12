'use client';

import type { Capsule, PatchCapsuleRequest } from '@tc/contracts';
import { encryptBytes, fromBase64Url, generateCapsuleKey, toBase64Url } from '@tc/crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { guestApi } from './api-client';
import { emptyEnvelope } from './letter-envelope';
import type { AutosaveStatus, CapsuleDraft } from './use-capsule-draft';

const GUEST_DRAFT_KEY = 'tc-guest-draft';

/**
 * A guest's draft, satisfying the same `CapsuleDraft` interface the
 * authenticated composer uses.
 *
 * This is the whole point of the interface. The landing page's flow and the
 * signed-in composer render the *same* components; the only differences are
 * what backs the draft and which capabilities are switched on. Previously
 * `/try` carried its own composer — a plain textarea, its own gradient
 * presets, its own date inputs — and the two drifted apart immediately,
 * because nothing structurally stopped them.
 *
 * The letter itself still lives only in session storage until seal — there is
 * no server-side draft for it, and nothing here changes that. **Media is
 * different (M5).** A file has to go somewhere the instant it's chosen, so a
 * guest who encloses anything needs a real capsule row and a real capsule key
 * well before the final "Seal capsule" press — `ensureMediaCapsule` below is
 * that: created once, on whichever comes first (the first enclosure, or
 * seal), and cached in this same session-storage blob so a reload doesn't
 * mint a second one. Session rather than local storage, still — an abandoned
 * draft (media attached or not) should not outlive the tab, matching `01
 * §4.1b`'s "deliberately ephemeral until claimed."
 */

const BLANK: Partial<Capsule> = {
  id: 'guest-draft',
  title: null,
  type: 'personal',
  state: 'draft',
  unlockMode: 'absolute',
  unlockAt: null,
  unlockLocal: null,
  recurrence: null,
  seals: [],
  cover: null,
  expiresAfter: null,
  expiryStrict: false,
  breakGlass: 'disabled',
  recipientsVisible: false,
  allowDownload: true,
  announceOnSeal: false,
  requireRecipientVerification: false,
  sizeBytes: 0,
  contentDocEnc: null,
  ownerKeyWrap: null,
};

/** The real, server-side capsule a guest's media (and eventually letter) lands in — absent until first needed. */
interface StoredMediaCapsule {
  capsuleId: string;
  recipientToken: string;
  /** base64url — the raw AES key, same format `guest-store.ts`'s post-seal cache already uses. */
  capsuleKeyB64: string;
}

interface StoredGuestDraft {
  capsule: Partial<Capsule>;
  contentDoc: unknown;
  mediaCapsule?: StoredMediaCapsule | null;
}

function read(): StoredGuestDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(GUEST_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as StoredGuestDraft) : null;
  } catch {
    return null;
  }
}

function write(value: StoredGuestDraft): void {
  try {
    sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify(value));
  } catch {
    // A full or unavailable store is not worth interrupting the writer over.
  }
}

export function clearGuestDraft(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(GUEST_DRAFT_KEY);
}

export interface GuestDraft extends CapsuleDraft {
  /** The letter envelope, for the seal step to encrypt. */
  envelope: unknown;
  /** Set once a real capsule exists server-side — null for a pure-text draft that hasn't enclosed anything or sealed yet. */
  mediaCapsuleId: string | null;
  /**
   * Creates the real server-side capsule and its capsule key on first call,
   * and returns the cached pair on every call after — including across a
   * reload, since both are persisted the moment they're created. The one
   * thing that makes Guest media possible at all: a media ticket needs a
   * real `capsuleId` to attach to, and encrypting a file needs a real key,
   * neither of which existed before a letter was sealed until this.
   *
   * `seal()` calls this too rather than duplicating capsule creation — if
   * nothing was ever enclosed it creates fresh, at the same moment it always
   * did; if something was, it reuses that exact capsule and key, so the
   * letter is encrypted with the same key that already encrypted whatever's
   * attached to it.
   */
  ensureMediaCapsule: () => Promise<{ capsuleId: string; recipientToken: string; capsuleKey: Uint8Array }>;
}

export function useGuestDraft(guestToken: string | null): GuestDraft {
  // Capsule and letter are held together so persistence is one write of one
  // consistent pair. Keeping them in separate states meant the only way to save
  // both was to read one from inside the other's updater, and a state updater
  // that performs side effects runs twice under StrictMode.
  const [state, setState] = useState<StoredGuestDraft>(() => ({
    capsule: BLANK,
    contentDoc: emptyEnvelope(),
    mediaCapsule: null,
  }));
  const [loading, setLoading] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const restored = useRef(false);

  // Mirrors `use-capsule-draft.ts`'s own `contentDocRef` pattern: read from a
  // ref inside callbacks rather than depending on `state`, so
  // `ensureMediaCapsule`'s identity stays stable across every keystroke
  // instead of churning on every render. Synced via an effect, not written
  // inline during render (`react-hooks/refs` — a ref is an escape hatch for
  // event handlers/effects, not a place to stash a render-time value).
  const stateRef = useRef(state);
  const guestTokenRef = useRef(guestToken);
  useEffect(() => {
    stateRef.current = state;
    guestTokenRef.current = guestToken;
  }, [state, guestToken]);
  // Collapses a burst of near-simultaneous calls (e.g. two files dropped at
  // once, both racing to be the one that creates the capsule) into a single
  // creation — the second caller awaits the first's in-flight promise
  // instead of starting a second `createCapsule` that the server would
  // reject anyway (one capsule per guest session).
  const creatingRef = useRef<Promise<{ capsuleId: string; recipientToken: string; capsuleKey: Uint8Array }> | null>(null);

  // Restore on mount, deferred — an effect body must not call setState
  // synchronously, the same constraint useCapsuleDraft works under.
  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = read();
      if (stored) setState({ capsule: { ...BLANK, ...stored.capsule }, contentDoc: stored.contentDoc, mediaCapsule: stored.mediaCapsule ?? null });
      restored.current = true;
      setLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Persisting in an effect keeps the updaters pure and means one write per
  // settled state rather than one per keystroke path.
  useEffect(() => {
    if (!restored.current) return;
    write(state);
    setAutosaveStatus('saved');
  }, [state]);

  const patch = useCallback((fields: PatchCapsuleRequest) => {
    setAutosaveStatus('pending');
    setState((prev) => ({ ...prev, capsule: { ...prev.capsule, ...fields } }));
  }, []);

  const setContentDoc = useCallback((doc: unknown) => {
    setAutosaveStatus('pending');
    setState((prev) => ({ ...prev, contentDoc: doc }));
  }, []);

  const ensureMediaCapsule = useCallback(async () => {
    const cached = stateRef.current.mediaCapsule;
    if (cached) {
      return { capsuleId: cached.capsuleId, recipientToken: cached.recipientToken, capsuleKey: fromBase64Url(cached.capsuleKeyB64) };
    }
    if (creatingRef.current) return creatingRef.current;

    const token = guestTokenRef.current;
    if (!token) {
      // Session creation (`/try`'s own mount effect) hasn't resolved yet — a
      // narrow race, since Compose is only reachable after Address, well
      // after that request normally lands. Thrown loudly rather than
      // silently retried, matching `encryptForCapsule`'s existing style.
      throw new Error('Guest session is not ready yet — try again in a moment');
    }

    const promise = (async () => {
      const created = await guestApi.createCapsule(token, {});
      const capsuleKey = generateCapsuleKey();
      const mediaCapsule: StoredMediaCapsule = {
        capsuleId: created.id,
        recipientToken: created.recipientToken!,
        capsuleKeyB64: toBase64Url(capsuleKey),
      };
      setState((prev) => ({ ...prev, mediaCapsule }));
      return { capsuleId: mediaCapsule.capsuleId, recipientToken: mediaCapsule.recipientToken, capsuleKey };
    })();

    creatingRef.current = promise;
    try {
      return await promise;
    } finally {
      creatingRef.current = null;
    }
  }, []);

  return {
    capsule: state.capsule as Capsule,
    contentDoc: state.contentDoc,
    envelope: state.contentDoc,
    mediaCapsuleId: state.mediaCapsule?.capsuleId ?? null,
    loading,
    ready: !loading,
    autosaveStatus,
    // A guest draft's letter lives in session storage until seal — there is
    // no server to refuse it while writing.
    saveRejection: null,
    patch,
    setContentDoc,
    flush: async () => {},
    ensureMediaCapsule,
    // Used by enclosure encryption once a capsule (and key) exist — created
    // lazily via `ensureMediaCapsule` rather than up front, since most
    // guest drafts never enclose anything and shouldn't pay for a capsule
    // row they'll never use.
    encryptForCapsule: async (bytes: Uint8Array) => {
      const { capsuleKey } = await ensureMediaCapsule();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, bytes);
      const combined = new Uint8Array(iv.length + ciphertext.length);
      combined.set(iv, 0);
      combined.set(ciphertext, iv.length);
      return combined;
    },
    wrapForPassphrase: async () => {
      throw new Error('Guest capsules cannot carry a passphrase seal');
    },
    registerRecipientToken: () => {},
    sendAnnounceToAll: async () => ({ total: 0, succeeded: 0, failedRecipientIds: [] }),
  };
}
