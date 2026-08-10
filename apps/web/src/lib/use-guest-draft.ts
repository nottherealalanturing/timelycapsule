'use client';

import type { Capsule, PatchCapsuleRequest } from '@tc/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
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
 * A guest has no capsule row and no master key until they seal, so everything
 * lives in session storage and nothing is encrypted yet: the capsule key is
 * generated at seal time, which is also when the content is first encrypted and
 * sent. Session rather than local storage because an abandoned guest draft
 * should not outlive the tab — `01 §4.1b` makes the guest capsule deliberately
 * ephemeral until it is claimed.
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

interface StoredGuestDraft {
  capsule: Partial<Capsule>;
  contentDoc: unknown;
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
}

export function useGuestDraft(): GuestDraft {
  // Capsule and letter are held together so persistence is one write of one
  // consistent pair. Keeping them in separate states meant the only way to save
  // both was to read one from inside the other's updater, and a state updater
  // that performs side effects runs twice under StrictMode.
  const [state, setState] = useState<StoredGuestDraft>(() => ({
    capsule: BLANK,
    contentDoc: emptyEnvelope(),
  }));
  const [loading, setLoading] = useState(true);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const restored = useRef(false);

  // Restore on mount, deferred — an effect body must not call setState
  // synchronously, the same constraint useCapsuleDraft works under.
  useEffect(() => {
    const timer = setTimeout(() => {
      const stored = read();
      if (stored) setState({ capsule: { ...BLANK, ...stored.capsule }, contentDoc: stored.contentDoc });
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

  return {
    capsule: state.capsule as Capsule,
    contentDoc: state.contentDoc,
    envelope: state.contentDoc,
    loading,
    ready: !loading,
    autosaveStatus,
    patch,
    setContentDoc,
    flush: async () => {},
    // A guest has no capsule key until the seal, so nothing can be encrypted
    // ahead of it. Enclosures are switched off for guests anyway; this refuses
    // loudly rather than silently returning plaintext.
    encryptForCapsule: async () => {
      throw new Error('Guest capsules are encrypted at seal time');
    },
    wrapForPassphrase: async () => {
      throw new Error('Guest capsules cannot carry a passphrase seal');
    },
    registerRecipientToken: () => {},
    sendAnnounceToAll: async () => ({ total: 0, succeeded: 0, failedRecipientIds: [] }),
  };
}
