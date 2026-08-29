import type { Capsule, CreateRecipientRequest, PatchCapsuleRequest, Recipient } from '@tc/contracts';
import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, capsulesApi, recipientsApi } from './api-client';

export type CapsuleDraftState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; capsule: Capsule; recipients: Recipient[] };

/**
 * Screen-local data + mutation for the Address movement (E1.4.1) only — not
 * the full offline-encrypted-draft architecture `plan/STAGE-E-MOBILE-V1-
 * IMPLEMENTATION-BLUEPRINT.md §6` describes for text content (that's
 * `E1.4.3`/`E1.4.4`'s job, once there is a letter to autosave). Address has
 * no high-frequency typing to debounce — a recipient add, a type toggle, or
 * a horizon/date pick are discrete, infrequent events — so every change
 * here goes straight to the server immediately, matching how web's own
 * `AddresseeBeat` already adds/removes recipients (no debounce there
 * either); only web's *letter* autosave is debounced, and Address doesn't
 * have one.
 *
 * Because every change is already persisted server-side the moment it
 * happens, "does state survive leaving and returning to this screen"
 * requires no local cache of its own — re-mounting this hook for the same
 * `id` simply reloads the already-current server state, the same way
 * `use-capsule-detail.ts` does for the read-only detail screen.
 */
export function useCapsuleDraft(id: string): {
  state: CapsuleDraftState;
  retry: () => void;
  patch: (fields: Partial<PatchCapsuleRequest>) => Promise<boolean>;
  patchError: string | null;
  addRecipient: (input: CreateRecipientRequest) => Promise<boolean>;
  removeRecipient: (recipientId: string) => Promise<boolean>;
  recipientError: string | null;
} {
  const [state, setState] = useState<CapsuleDraftState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([capsulesApi.get(id), capsulesApi.recipients(id)])
      .then(([capsuleRes, recipientsRes]) => {
        if (!cancelled) setState({ status: 'ready', capsule: capsuleRes.capsule, recipients: recipientsRes.data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  const patch = useCallback(
    async (fields: Partial<PatchCapsuleRequest>) => {
      setPatchError(null);
      try {
        const res = await capsulesApi.patch(id, fields);
        setState((prev) => (prev.status === 'ready' ? { ...prev, capsule: res.capsule } : prev));
        return true;
      } catch {
        setPatchError("That couldn't be saved. Check your connection and try again.");
        return false;
      }
    },
    [id],
  );

  const addRecipient = useCallback(
    async (input: CreateRecipientRequest) => {
      setRecipientError(null);
      try {
        const res = await recipientsApi.create(id, input);
        setState((prev) => (prev.status === 'ready' ? { ...prev, recipients: [...prev.recipients, res.recipient] } : prev));
        return true;
      } catch (err) {
        setRecipientError(
          err instanceof ApiClientError && err.code === 'recipient_already_added'
            ? 'That recipient is already added.'
            : 'That recipient could not be added.',
        );
        return false;
      }
    },
    [id],
  );

  const removeRecipient = useCallback(
    async (recipientId: string) => {
      setRecipientError(null);
      try {
        await recipientsApi.delete(id, recipientId);
        setState((prev) =>
          prev.status === 'ready' ? { ...prev, recipients: prev.recipients.filter((r) => r.id !== recipientId) } : prev,
        );
        return true;
      } catch {
        setRecipientError('That recipient could not be removed.');
        return false;
      }
    },
    [id],
  );

  return { state, retry, patch, patchError, addRecipient, removeRecipient, recipientError };
}
