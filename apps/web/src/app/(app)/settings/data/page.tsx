'use client';

import type { CapsuleDeletionDecision, DeletionPreviewItem } from '@tc/contracts';
import { Button, Input, useToast } from '@tc/ui-web';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError, settingsApi } from '../../../../lib/api-client';
import { useAuth } from '../../../../lib/auth-context';

function ExportSection() {
  const { show } = useToast();
  const [requested, setRequested] = useState(false);

  const mutation = useMutation({
    mutationFn: () => settingsApi.requestExport(),
    onSuccess: () => setRequested(true),
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' }),
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-[var(--font-display)] text-lg text-foreground">Export your data</h2>
      <p className="text-sm text-secondary">
        We&apos;ll build a zip of everything you own — encrypted contents plus a metadata file — and email you a
        download link. It can take a few minutes.
      </p>
      {requested ? (
        <p className="text-sm text-foreground">Started — check your email in a few minutes.</p>
      ) : (
        <Button variant="secondary" loading={mutation.isPending} onClick={() => mutation.mutate()} className="w-fit">
          Request export
        </Button>
      )}
    </section>
  );
}

type DeleteStep = 'idle' | 'password' | 'decisions' | 'confirm' | 'done';

function DeleteAccountSection() {
  const { logout } = useAuth();
  const [step, setStep] = useState<DeleteStep>('idle');
  const [password, setPassword] = useState('');
  const [decisions, setDecisions] = useState<Record<string, CapsuleDeletionDecision['action']>>({});
  const [error, setError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ['deletion-preview'],
    queryFn: () => settingsApi.getDeletionPreview(),
    enabled: step === 'decisions',
  });
  const needsDecision: DeletionPreviewItem[] = previewQuery.data?.needsDecision ?? [];

  const deleteMutation = useMutation({
    mutationFn: () =>
      settingsApi.deleteAccount({
        password,
        capsuleDecisions: needsDecision.map((c) => ({ capsuleId: c.id, action: decisions[c.id] ?? 'deliver' })),
      }),
    onSuccess: () => setStep('done'),
    onError: (err) => setError(err instanceof ApiClientError ? err.message : 'Something went wrong'),
  });

  const allDecided = needsDecision.every((c) => decisions[c.id]);

  if (step === 'done') {
    return (
      <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 p-4">
        <h2 className="font-[var(--font-display)] text-lg text-foreground">Account deletion scheduled</h2>
        <p className="text-sm text-secondary">
          Your account will be permanently deleted in 30 days. Log back in any time before then to cancel.
        </p>
        <Button variant="secondary" onClick={() => void logout()} className="w-fit">
          Log out
        </Button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 p-4">
      <h2 className="font-[var(--font-display)] text-lg text-[var(--color-danger)]">Danger zone</h2>

      {step === 'idle' ? (
        <>
          <p className="text-sm text-secondary">Deleting your account is a 30-day process — you can cancel any time by logging back in.</p>
          <Button variant="destructive" onClick={() => setStep('password')} className="w-fit">
            Delete account
          </Button>
        </>
      ) : step === 'password' ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setStep('decisions');
          }}
        >
          <p className="text-sm text-secondary">Confirm your password to continue.</p>
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={!password}>
              Continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep('idle')}>
              Cancel
            </Button>
          </div>
        </form>
      ) : step === 'decisions' ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            These sealed capsules haven&apos;t reached their recipients yet. Choose what happens to each one.
          </p>
          {needsDecision.length === 0 ? (
            <p className="text-sm text-foreground">Nothing undelivered — you&apos;re clear to continue.</p>
          ) : (
            needsDecision.map((capsule) => (
              <div key={capsule.id} className="rounded-[var(--radius-input)] border border-[var(--color-rule)] p-3">
                <p className="text-sm font-medium text-foreground">{capsule.title || 'Untitled capsule'}</p>
                <p className="mb-2 text-sm text-secondary">{capsule.recipientCount} recipient(s)</p>
                <div className="flex gap-4 text-sm text-foreground">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`decision-${capsule.id}`}
                      checked={decisions[capsule.id] === 'deliver'}
                      onChange={() => setDecisions((prev) => ({ ...prev, [capsule.id]: 'deliver' }))}
                    />
                    Deliver as scheduled
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`decision-${capsule.id}`}
                      checked={decisions[capsule.id] === 'withdraw'}
                      onChange={() => setDecisions((prev) => ({ ...prev, [capsule.id]: 'withdraw' }))}
                    />
                    Withdraw
                  </label>
                </div>
              </div>
            ))
          )}
          <div className="flex gap-2">
            <Button variant="destructive" disabled={!allDecided} onClick={() => setStep('confirm')}>
              Continue
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-secondary">
            This starts a 30-day countdown to permanent deletion. Logging back in before then cancels it.
          </p>
          {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="destructive" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              Delete my account
            </Button>
            <Button variant="ghost" onClick={() => setStep('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DataSettingsPage() {
  return (
    <div className="flex max-w-lg flex-col gap-10">
      <ExportSection />
      <DeleteAccountSection />
    </div>
  );
}
