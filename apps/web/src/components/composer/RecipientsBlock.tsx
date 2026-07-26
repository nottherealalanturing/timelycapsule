'use client';

import type { CapsuleType } from '@tc/contracts';
import { Button, Input } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { recipientsApi } from '../../lib/api-client';
import type { CapsuleDraft } from '../../lib/use-capsule-draft';

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function RecipientsBlock({ capsuleId, draft }: { capsuleId: string; capsuleType: CapsuleType; draft: CapsuleDraft }) {
  const queryClient = useQueryClient();
  const queryKey = ['recipients', capsuleId] as const;
  const { data: recipients = [] } = useQuery({
    queryKey,
    queryFn: async () => (await recipientsApi.list(capsuleId)).data,
  });
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  if (draft.capsule?.type === 'self') {
    return null;
  }

  async function addRecipient() {
    const value = input.trim();
    if (!value) return;
    setError(null);
    try {
      if (isEmail(value)) {
        await recipientsApi.create(capsuleId, { email: value });
      } else {
        await recipientsApi.create(capsuleId, { phone: value });
      }
      setInput('');
      await refresh();
    } catch {
      setError('Could not add that recipient');
    }
  }

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

      <div className="flex gap-2">
        <Input
          label="Email or phone"
          placeholder="ada@example.com"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void addRecipient();
            }
          }}
        />
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
