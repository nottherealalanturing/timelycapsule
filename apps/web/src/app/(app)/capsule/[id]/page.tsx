'use client';

import type { Capsule, MediaItem, Recipient } from '@tc/contracts';
import { Button, Dialog, Skeleton, StateChip, useToast } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { decryptBytes, unwrapCapsuleKeyForOwner } from '@tc/crypto';
import { CountdownDisplay } from '../../../../components/CountdownDisplay';
import { resolveUnlockDate } from '../../../../components/CapsuleCard';
import { ApiClientError, capsulesApi, mediaApi, recipientsApi } from '../../../../lib/api-client';
import { decodeIvCiphertext } from '../../../../lib/capsule-crypto';
import { useMasterKey } from '../../../../lib/master-key-context';
import { MasterKeyGate } from '../../../../components/MasterKeyGate';

type Tab = 'overview' | 'recipients' | 'activity' | 'contents';

/** Minimal read-only rendering of a TipTap JSON doc — plain paragraphs, not a full rich-text renderer (the letter only ever uses minimal marks, see T-11). */
function renderDoc(doc: unknown): string {
  const node = doc as { content?: { content?: { text?: string }[] }[] } | null;
  if (!node?.content) return '';
  return node.content
    .map((block) => (block.content ?? []).map((leaf) => leaf.text ?? '').join(''))
    .join('\n\n');
}

function coverStyle(cover: Capsule['cover']): React.CSSProperties {
  if (cover?.kind === 'gradient') return { background: cover.value };
  return { background: 'var(--color-bg-raised)' };
}

function ContentsPanel({ capsule }: { capsule: Capsule }) {
  const { masterKey } = useMasterKey();
  const { data: media = [] } = useQuery({
    queryKey: ['media', capsule.id],
    queryFn: async () => (await mediaApi.list(capsule.id)).data,
  });
  const { data: letter, isLoading } = useQuery({
    queryKey: ['capsule-contents', capsule.id],
    queryFn: async () => {
      if (!capsule.contentDocEnc || !capsule.ownerKeyWrap || !masterKey) return null;
      const capsuleKey = await unwrapCapsuleKeyForOwner(capsule.ownerKeyWrap, masterKey);
      const { iv, ciphertext } = decodeIvCiphertext(capsule.contentDocEnc);
      const plaintext = await decryptBytes(capsuleKey, iv, ciphertext);
      return renderDoc(JSON.parse(new TextDecoder().decode(plaintext)));
    },
    enabled: Boolean(masterKey),
  });

  async function viewMedia(item: MediaItem) {
    if (!masterKey || !capsule.ownerKeyWrap) return;
    const capsuleKey = await unwrapCapsuleKeyForOwner(capsule.ownerKeyWrap, masterKey);
    const { url } = await mediaApi.view(item.id);
    const res = await fetch(url);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const plaintext = await decryptBytes(capsuleKey, iv, ciphertext);
    // TS's DOM lib types BlobPart's ArrayBufferView as Uint8Array<ArrayBuffer>
    // specifically, excluding the wider Uint8Array<ArrayBufferLike> that
    // decryptBytes returns — same lib-version quirk as packages/crypto's
    // buffer-source.ts `bs()` cast, not a real runtime distinction here.
    const blob = new Blob([plaintext as unknown as BlobPart], { type: item.mime ?? 'application/octet-stream' });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="whitespace-pre-wrap rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 p-4 text-foreground">
        {letter || 'No letter content.'}
      </div>
      {media.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {media.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/15 px-4 py-2">
              <span className="text-sm text-foreground">{item.originalName}</span>
              <Button variant="ghost" size="sm" onClick={() => void viewMedia(item)}>
                Decrypt &amp; view
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function CapsuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [extendOpen, setExtendOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [newUnlockAt, setNewUnlockAt] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['capsule', id],
    queryFn: () => capsulesApi.get(id),
  });
  const capsule = data?.capsule;

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients', id],
    queryFn: () => recipientsApi.list(id),
    enabled: Boolean(capsule),
  });
  const recipients: Recipient[] = recipientsData?.data ?? [];

  const { data: activityData } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => capsulesApi.activity(id),
    enabled: Boolean(capsule) && tab === 'activity',
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['capsule', id] });
  }

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    try {
      await action();
      await refresh();
      show(successMessage);
    } catch (err) {
      show(err instanceof ApiClientError ? err.message : 'Something went wrong', { variant: 'danger' });
    }
  }

  if (isLoading || !capsule) {
    return (
      <div className="flex flex-col gap-4 px-8 py-10">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-6 w-1/3" />
      </div>
    );
  }

  const unlockDate = resolveUnlockDate(capsule);
  const openedCount = recipients.filter((r) => r.status === 'opened').length;
  const contentsHidden = capsule.type === 'self' && capsule.state === 'sealed';

  return (
    <div className="flex flex-col gap-6 px-8 py-10">
      <div className="overflow-hidden rounded-[var(--radius-card)]">
        <div className="flex h-32 flex-col justify-end p-4" style={coverStyle(capsule.cover)}>
          <StateChip state={capsule.state} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl text-foreground">{capsule.title || 'Untitled capsule'}</h1>
          {capsule.state === 'sealed' && unlockDate ? (
            <p className="mt-1 text-sm text-secondary">
              Unlocks in <CountdownDisplay target={unlockDate} className="font-medium text-foreground" />
            </p>
          ) : capsule.state === 'unlocked' && recipients.length > 0 ? (
            <p className="mt-1 text-sm text-secondary">
              Opened by {openedCount} of {recipients.length}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void runAction(() => capsulesApi.duplicate(id).then((r) => router.push(`/capsule/${r.capsule.id}/edit`)), 'Duplicated')}>
            Duplicate
          </Button>
          {capsule.state === 'sealed' && !capsule.extendedOnce ? (
            <Button variant="secondary" size="sm" onClick={() => setExtendOpen(true)}>
              Extend unlock
            </Button>
          ) : null}
          {capsule.state === 'sealed' ? (
            <Button variant="destructive" size="sm" onClick={() => setWithdrawOpen(true)}>
              Withdraw
            </Button>
          ) : null}
          {capsule.archivedAt ? (
            <Button variant="ghost" size="sm" onClick={() => void runAction(() => capsulesApi.unarchive(id), 'Unarchived')}>
              Unarchive
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => void runAction(() => capsulesApi.archive(id), 'Archived')}>
              Archive
            </Button>
          )}
          {capsule.trashedAt ? (
            <Button variant="ghost" size="sm" onClick={() => void runAction(() => capsulesApi.restore(id), 'Restored')}>
              Restore
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => void runAction(() => capsulesApi.trash(id), 'Moved to trash')}>
              Trash
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 border-b border-[var(--color-text-secondary)]/15">
        {(['overview', 'recipients', 'activity', 'contents'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-1 pb-2 text-sm capitalize ${
              tab === t ? 'border-accent font-medium text-foreground' : 'border-transparent text-secondary'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-secondary">Type</dt>
            <dd className="text-foreground">{capsule.type}</dd>
          </div>
          <div>
            <dt className="text-secondary">Size</dt>
            <dd className="text-foreground">{(capsule.sizeBytes / 1024).toFixed(1)} KB</dd>
          </div>
          <div>
            <dt className="text-secondary">Allow download</dt>
            <dd className="text-foreground">{capsule.allowDownload ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-secondary">Announce on seal</dt>
            <dd className="text-foreground">{capsule.announceOnSeal ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      ) : tab === 'recipients' ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-secondary">
              <th className="pb-2 font-medium">Recipient</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-text-secondary)]/10">
                <td className="py-2 text-foreground">{r.displayName || r.email || r.phone}</td>
                <td className="py-2 text-secondary">{r.status}</td>
              </tr>
            ))}
            {recipients.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-4 text-secondary">
                  No recipients.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : tab === 'activity' ? (
        <ul className="flex flex-col gap-2 text-sm">
          {(activityData?.data ?? []).map((entry, i) => (
            <li key={i} className="flex justify-between border-b border-[var(--color-text-secondary)]/10 pb-2">
              <span className="text-foreground">{entry.action}</span>
              <span className="text-secondary">{new Date(entry.createdAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      ) : contentsHidden ? (
        <p className="rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 p-6 text-center text-sm text-secondary">
          This capsule&apos;s contents are hidden until it unlocks — the wait is the point.
        </p>
      ) : (
        <MasterKeyGate>
          <ContentsPanel capsule={capsule} />
        </MasterKeyGate>
      )}

      <Dialog open={extendOpen} onOpenChange={setExtendOpen} title="Extend unlock date" width="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">Can only be done once, up to 30 days later.</p>
          <input
            type="datetime-local"
            value={newUnlockAt}
            onChange={(e) => setNewUnlockAt(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent px-3 py-2 text-sm text-foreground"
          />
          <Button
            fullWidth
            disabled={!newUnlockAt}
            onClick={() =>
              void runAction(() => capsulesApi.extend(id, { newUnlockAt: new Date(newUnlockAt).toISOString() }), 'Unlock extended').then(() =>
                setExtendOpen(false),
              )
            }
          >
            Confirm
          </Button>
        </div>
      </Dialog>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen} title="Withdraw this capsule?" width="sm">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-secondary">
            Recipients who knew about this capsule will be told it was withdrawn. Its contents will never be shown.
          </p>
          <Button
            variant="destructive"
            fullWidth
            onClick={() => void runAction(() => capsulesApi.withdraw(id), 'Withdrawn').then(() => setWithdrawOpen(false))}
          >
            Withdraw
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
