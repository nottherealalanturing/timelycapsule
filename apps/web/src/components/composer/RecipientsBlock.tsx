'use client';

import type { CapsuleType, Contact } from '@tc/contracts';
import { Button, Input } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { contactsApi, recipientsApi } from '../../lib/api-client';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';
import type { InitialRecipient } from './Composer';

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function matchesContact(contact: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return Boolean(
    contact.name.toLowerCase().includes(q) || contact.email?.toLowerCase().includes(q) || contact.phone?.includes(q),
  );
}

export function RecipientsBlock({
  capsuleId,
  draft,
  initialRecipient,
}: {
  capsuleId: string;
  capsuleType: CapsuleType;
  draft: CapsuleDraft;
  initialRecipient?: InitialRecipient;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['recipients', capsuleId] as const;
  const { data: recipients = [] } = useQuery({
    queryKey,
    queryFn: async () => (await recipientsApi.list(capsuleId)).data,
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => (await contactsApi.list()).data,
  });
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  async function addRecipient(overrides?: { email?: string; phone?: string; displayName?: string }) {
    const email = overrides?.email ?? (isEmail(input.trim()) ? input.trim() : undefined);
    const phone = overrides?.phone ?? (!overrides?.email && !isEmail(input.trim()) ? input.trim() : undefined);
    const displayName = overrides?.displayName;
    if (!email && !phone) return;
    setError(null);
    try {
      const { recipient, accessToken } = await recipientsApi.create(capsuleId, { email, phone, displayName });
      draft.registerRecipientToken(recipient.id, accessToken);

      // Adding a recipient to an already-sealed, already-announced capsule (recipients
      // stay editable pre-unlock, T-09 invariant 1) is this recipient's only chance at an
      // announce email — sealing itself already happened, so nothing will trigger it later.
      if (draft.capsule?.state === 'sealed' && draft.capsule.announceOnSeal) {
        await draft.sendAnnounceToAll(capsuleId);
      }

      setInput('');
      setSuggestionsOpen(false);
      await refresh();
    } catch {
      setError('Could not add that recipient');
    }
  }

  // "Start a capsule" from /people's birthday-upcoming section (02-UX-DESIGN.md
  // §5.9) — add the suggested contact once, on first load, if nothing's been
  // added yet (guards against re-adding on a later remount/refresh).
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !initialRecipient || recipients.length > 0) return;
    prefilled.current = true;
    void addRecipient(initialRecipient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRecipient, recipients.length]);

  if (draft.capsule?.type === 'self') {
    return null;
  }

  const suggestions = suggestionsOpen ? contacts.filter((c) => matchesContact(c, input)).slice(0, 5) : [];

  async function removeRecipient(id: string) {
    await recipientsApi.delete(capsuleId, id);
    await refresh();
  }

  const capsule = draft.capsule!;

  return (
    <section aria-label="Recipients" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-secondary">Recipients</h2>

      <div className="flex flex-wrap gap-2">
        {recipients.map((r) => (
          <span
            key={r.id}
            className="flex items-center gap-2 rounded-full border border-[var(--color-text-secondary)]/30 px-3 py-1 text-sm text-foreground"
          >
            {r.displayName || r.email || r.phone}
            <button type="button" onClick={() => void removeRecipient(r.id)} aria-label={`Remove ${r.email ?? r.phone}`} className="text-secondary">
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="relative flex gap-2">
        <div className="flex-1">
          <Input
            label="Email or phone"
            placeholder="ada@example.com"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setSuggestionsOpen(true);
            }}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addRecipient();
              }
            }}
          />
          {suggestions.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-[var(--color-bg-raised)] py-1 shadow-[var(--shadow-md)]">
              {suggestions.map((contact) => (
                <li key={contact.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      void addRecipient({ email: contact.email ?? undefined, phone: contact.phone ?? undefined, displayName: contact.name })
                    }
                    className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-[var(--color-bg-base)]"
                  >
                    {contact.name}{' '}
                    <span className="text-secondary">{contact.email ?? contact.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button type="button" variant="secondary" onClick={() => void addRecipient()}>
          Add
        </Button>
      </div>
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

      <div className="flex flex-col gap-2 text-sm text-secondary">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={capsule.recipientsVisible}
            onChange={(e) => draft.patch({ recipientsVisible: e.target.checked })}
          />
          Recipients can see who else is receiving this
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={capsule.allowDownload} onChange={(e) => draft.patch({ allowDownload: e.target.checked })} />
          Allow downloading the contents
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={capsule.announceOnSeal} onChange={(e) => draft.patch({ announceOnSeal: e.target.checked })} />
          Announce now (uncheck for a surprise — no email until it opens)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={capsule.requireRecipientVerification}
            onChange={(e) => draft.patch({ requireRecipientVerification: e.target.checked })}
          />
          Require identity verification to open
        </label>
      </div>
    </section>
  );
}
