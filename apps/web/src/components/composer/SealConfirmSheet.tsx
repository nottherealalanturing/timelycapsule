'use client';

import type { Capsule } from '@tc/contracts';
import { Button, Dialog } from '@tc/ui-web';
import { useEffect, useState } from 'react';
import { recipientsApi } from '../../lib/api-client';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SealConfirmSheet({
  open,
  onOpenChange,
  capsule,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  capsule: Capsule;
  loading: boolean;
  onConfirm: () => void;
}) {
  const [recipientCount, setRecipientCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    void recipientsApi.list(capsule.id).then(({ data }) => setRecipientCount(data.length));
  }, [open, capsule.id]);

  const unlockSentence = capsule.unlockAt
    ? `Unlocks ${new Date(capsule.unlockAt).toLocaleDateString(undefined, { dateStyle: 'long' })}`
    : capsule.unlockLocal
      ? `Unlocks ${capsule.unlockLocal.date} at ${capsule.unlockLocal.time} (recipient's local time)`
      : 'No unlock date set';

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Seal this capsule?" width="sm">
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-rule)] p-4">
          <p className="text-[length:var(--text-title-s)] text-foreground">{capsule.title || 'Untitled capsule'}</p>
          <p className="mt-1 text-[length:var(--text-body-s)] text-secondary">
            {recipientCount === 0 ? 'No recipients (just for you)' : `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
          </p>
          <p className="mt-1 text-[length:var(--text-body-s)] text-secondary">{unlockSentence}</p>
          <p className="mt-1 text-[length:var(--text-body-s)] text-secondary">{formatBytes(capsule.sizeBytes)}</p>
        </div>

        <p className="text-[length:var(--text-body-s)] text-secondary">
          After sealing you can&apos;t edit the contents. You can still withdraw it before it unlocks.
        </p>

        <Button fullWidth loading={loading} onClick={onConfirm}>
          Seal capsule
        </Button>
      </div>
    </Dialog>
  );
}
