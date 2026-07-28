'use client';

import { Button, EmptyState, Input, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError, blocksApi } from '../../../../lib/api-client';

export default function PrivacySettingsPage() {
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const { data } = useQuery({ queryKey: ['blocks'], queryFn: () => blocksApi.list() });
  const blocks = data?.data ?? [];

  const addMutation = useMutation({
    mutationFn: () => blocksApi.create({ email }),
    onSuccess: () => {
      setEmail('');
      void queryClient.invalidateQueries({ queryKey: ['blocks'] });
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  const removeMutation = useMutation({
    mutationFn: (blockedEmail: string) => blocksApi.delete(blockedEmail),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['blocks'] }),
  });

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h2 className="font-[var(--font-display)] text-lg text-foreground">Privacy</h2>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-secondary">Blocked senders</h3>
        <p className="text-sm text-secondary">
          Capsules from a blocked address are never delivered — the sender never learns they were blocked.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) addMutation.mutate();
          }}
        >
          <Input label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1" />
          <Button type="submit" variant="secondary" loading={addMutation.isPending} disabled={!email.trim()}>
            Block
          </Button>
        </form>

        {blocks.length === 0 ? (
          <EmptyState title="No blocked senders." />
        ) : (
          <div className="flex flex-col gap-2">
            {blocks.map((block) => (
              <div
                key={block.blockedEmail}
                className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 px-4 py-2"
              >
                <span className="text-sm text-foreground">{block.blockedEmail}</span>
                <Button size="sm" variant="ghost" onClick={() => removeMutation.mutate(block.blockedEmail)}>
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
