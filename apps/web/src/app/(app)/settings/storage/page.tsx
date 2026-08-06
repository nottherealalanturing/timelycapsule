'use client';

import { Skeleton } from '@tc/ui-web';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { settingsApi } from '../../../../lib/api-client';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export default function StorageSettingsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['storage'], queryFn: () => settingsApi.getStorage() });

  if (isLoading || !data) {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  const percent = data.quotaBytes ? Math.min(100, (data.usedBytes / data.quotaBytes) * 100) : 0;

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <h2 className="font-[var(--font-display)] text-lg text-foreground">Storage</h2>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-secondary">
          {formatBytes(data.usedBytes)} used{data.quotaBytes ? ` of ${formatBytes(data.quotaBytes)}` : ' (unlimited plan)'}
        </p>
        {data.quotaBytes ? (
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-raised)]">
            <div className="h-full rounded-full bg-[var(--color-accent-gold)]" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-secondary">Largest capsules</h3>
        {data.largest.length === 0 ? (
          <p className="text-sm text-secondary">Nothing here yet.</p>
        ) : (
          data.largest.map((capsule) => (
            <Link
              key={capsule.id}
              href={`/capsule/${capsule.id}`}
              className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-rule)] px-4 py-3 text-sm hover:bg-[var(--color-bg-raised)]"
            >
              <span className="text-foreground">{capsule.title || 'Untitled capsule'}</span>
              <span className="text-secondary">{formatBytes(capsule.sizeBytes)}</span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
