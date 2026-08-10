'use client';

import type { Recipient } from '@tc/contracts';
import { Button, Dialog, DualClock, DurationStamp, Hallmark, MeridianApproach, Skeleton, useToast } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { useCorrectedNow } from '../../../../lib/use-corrected-now';
import { formatAbsoluteDate, horizonPhrase, resolveUnlockDate } from '../../../../lib/waiting';
import { ApiClientError, capsulesApi, collectionsApi, favoritesApi, recipientsApi, tagsApi } from '../../../../lib/api-client';
import { CustodyTerms } from '../../../../components/capsule/CustodyTerms';
import { LetterRecord } from '../../../../components/capsule/LetterRecord';
import { appFrame } from '../../../../components/page-frame';

const STATE_LABEL: Record<string, string> = {
  draft: 'Draft',
  sealing: 'Sealing',
  sealed: 'Sealed',
  unlocked: 'Opened',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

/**
 * A quiet, reversible action. Everything an owner can do to a capsule that is
 * not destructive reads the same way, so no single one of them draws the eye.
 */
function QuietAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {children}
    </Button>
  );
}

/**
 * A destructive action, subordinate.
 *
 * `Withdraw` was a filled danger button sitting in a flat row of seven, which
 * made the most irreversible thing on the page the most visually prominent
 * thing on it. The weight belongs on the *confirmation*, not on the page — the
 * dialogs below still carry a filled destructive button, which is where a
 * decision is actually made. Here it is a stated word.
 */
function GraveAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="motion-instant text-[length:var(--text-body-s)] text-secondary underline-offset-4 hover:text-[var(--color-danger)] hover:underline"
    >
      {children}
    </button>
  );
}

export default function CapsuleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [extendOpen, setExtendOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [newUnlockAt, setNewUnlockAt] = useState('');
  const [tagsOpen, setTagsOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['capsule', id],
    queryFn: () => capsulesApi.get(id),
  });
  const capsule = data?.capsule;

  // Placed above the loading early-return: hooks cannot be called
  // conditionally. `useCorrectedNow` tolerates a null target.
  const unlockTarget = capsule && capsule.state === 'sealed' ? resolveUnlockDate(capsule) : null;
  const nowMs = useCorrectedNow(unlockTarget);
  const sealedMs = capsule?.sealedAt ? new Date(capsule.sealedAt).getTime() : null;

  const { data: tagsData } = useQuery({ queryKey: ['tags'], queryFn: () => tagsApi.list() });
  const allTags = tagsData?.data ?? [];

  const { data: collectionsData } = useQuery({ queryKey: ['collections'], queryFn: () => collectionsApi.list() });
  const allCollections = collectionsData?.data ?? [];
  // Keying on the actual set of collection ids (not just `id`) — creating a
  // collection from inside this same dialog changes what "membership" even
  // means to compute (a new collection the capsule was just added to), and
  // the old key considered that identical to before, so React Query kept
  // serving the stale empty-set result until something unrelated happened
  // to invalidate it.
  const collectionIdsKey = allCollections.map((c) => c.id).sort().join(',');
  const { data: membershipData } = useQuery({
    queryKey: ['collection-membership', id, collectionIdsKey],
    queryFn: async () => {
      const memberOf = await Promise.all(
        allCollections.map(async (c) => ({ id: c.id, isMember: (await capsulesApi.list({ collectionId: c.id, limit: 100 })).data.some((cap) => cap.id === id) })),
      );
      return memberOf;
    },
    enabled: collectionsOpen && allCollections.length > 0,
  });
  const membership = membershipData ?? [];

  const [newCollectionName, setNewCollectionName] = useState('');
  const createCollectionMutation = useMutation({
    mutationFn: async (name: string) => {
      const { collection } = await collectionsApi.create({ name });
      // The whole reason this dialog is open is to add *this* capsule
      // somewhere — creating a collection and leaving it empty would just
      // move the dead end one step later instead of removing it.
      await collectionsApi.addItem(collection.id, { capsuleId: id });
      return collection;
    },
    onSuccess: async () => {
      setNewCollectionName('');
      await queryClient.invalidateQueries({ queryKey: ['collections'] });
      await queryClient.invalidateQueries({ queryKey: ['collection-membership', id] });
      show('Collection created and capsule added');
    },
    onError: (err) => show(err instanceof ApiClientError ? err.message : 'Could not create that collection', { variant: 'danger' }),
  });

  const favoriteMutation = useMutation({
    mutationFn: (value: boolean) => favoritesApi.set(id, value),
    onSuccess: () => void refresh(),
  });

  const tagsMutation = useMutation({
    mutationFn: (tagIds: string[]) => tagsApi.putForCapsule(id, tagIds),
    onSuccess: () => void refresh(),
  });

  const [newTagName, setNewTagName] = useState('');
  const createTagMutation = useMutation({
    mutationFn: (name: string) => tagsApi.create({ name }),
    onSuccess: async (res) => {
      setNewTagName('');
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
      tagsMutation.mutate([...(capsule?.tagIds ?? []), res.tag.id]);
    },
  });

  const { data: recipientsData } = useQuery({
    queryKey: ['recipients', id],
    queryFn: () => recipientsApi.list(id),
    enabled: Boolean(capsule),
  });
  const recipients: Recipient[] = recipientsData?.data ?? [];

  const { data: activityData } = useQuery({
    queryKey: ['activity', id],
    queryFn: () => capsulesApi.activity(id),
    enabled: Boolean(capsule) && activityOpen,
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
      <div className={appFrame('flex flex-col gap-6')}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const unlockDate = resolveUnlockDate(capsule);
  const openedCount = recipients.filter((r) => r.status === 'opened').length;
  const first = recipients[0];
  const addressee = capsule.type === 'self' ? null : (first?.displayName || first?.email || first?.phone || null);
  const whoFor = addressee ? `For ${addressee}` : capsule.type === 'self' ? 'For yourself' : 'For someone else';
  const opened = capsule.state === 'unlocked' && recipients.length > 0;

  // `04 §10.4` — the stamp is franked at the moment of opening, never during
  // the wait. So it appears once a capsule has *finished* waiting, which is
  // the only point at which the duration it reports is final.
  const finishedWaiting = capsule.state === 'unlocked' || capsule.state === 'expired';
  const stampMs =
    finishedWaiting && sealedMs !== null && unlockDate ? unlockDate.getTime() - sealedMs : null;

  return (
    <div className={appFrame('flex flex-col gap-9')}>
      {/* The same header the recipient's wait and the reveal wear — the public
          id on the left, what this capsule is on the right. `07 §VI.5`: the
          institution is present and static in every state. */}
      <header className="flex items-start justify-between gap-4 border-b border-[var(--color-rule)] pb-4">
        <Hallmark>{capsule.publicId}</Hallmark>
        <Hallmark>{STATE_LABEL[capsule.state] ?? capsule.state}</Hallmark>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          {/* Unnamed is the normal case — the title was removed from the
              writing flow entirely (`design/21 §II`) and is a note for the
              sender. So an unnamed capsule is named by what it is, in the
              same words `CapsuleRow` uses, rather than by a placeholder. */}
          <h1
            className={`text-[length:var(--text-title)] leading-[var(--lh-heading)] ${
              capsule.title ? 'text-foreground' : 'text-secondary'
            }`}
          >
            {capsule.title || whoFor}
          </h1>
          <button
            type="button"
            aria-label={capsule.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={capsule.isFavorite}
            onClick={() => favoriteMutation.mutate(!capsule.isFavorite)}
            className={`motion-instant shrink-0 text-[length:var(--text-body-s)] ${
              capsule.isFavorite ? 'text-[var(--color-interactive)]' : 'text-secondary hover:text-foreground'
            }`}
          >
            ★
          </button>
        </div>

        {/* Only where it adds something. When the capsule is unnamed the
            heading is already this line, and printing it twice is the kind
            of small disagreement that makes a surface feel unconsidered. */}
        {capsule.title || opened ? (
          <p className="text-[length:var(--text-body-s)] text-secondary">
            {capsule.title ? whoFor : null}
            {capsule.title && opened ? ' · ' : null}
            {opened ? `opened by ${openedCount} of ${recipients.length}` : null}
          </p>
        ) : null}

        {capsule.tagIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {capsule.tagIds.map((tagId) => {
              const tag = allTags.find((t) => t.id === tagId);
              return tag ? (
                <span
                  key={tagId}
                  className="rounded-[var(--radius-input)] border border-[var(--color-rule)] px-2 py-0.5 text-[length:var(--text-caption)] text-secondary"
                >
                  {tag.name}
                </span>
              ) : null;
            })}
          </div>
        ) : null}
      </div>

      {/*
        The wait, while there is one — the full reading `03 §V` asks for:
        both figures, the position on the Meridian, and the literal date.
        Once the wait is over the instrument is replaced by the receipt, and
        the Duration Stamp says what it came to.
      */}
      {capsule.state === 'sealed' && unlockDate && sealedMs !== null && nowMs !== null ? (
        <section aria-label="The wait" className="flex max-w-md flex-col gap-4">
          <DualClock elapsedMs={nowMs - sealedMs} remainingMs={unlockDate.getTime() - nowMs} />
          <MeridianApproach remainingMs={unlockDate.getTime() - nowMs} />
          <div className="flex flex-col gap-0.5">
            <p className="text-[length:var(--text-body-s)] text-foreground">
              Sealed until {formatAbsoluteDate(unlockDate.toISOString())}
            </p>
            <p className="text-[length:var(--text-caption)] text-secondary">
              {horizonPhrase(unlockDate.getTime() - nowMs)}
            </p>
          </div>
        </section>
      ) : stampMs !== null && stampMs > 0 ? (
        <section aria-label="What it came to" className="flex flex-col gap-2">
          <DurationStamp elapsedMs={stampMs} className="self-start" />
          {unlockDate ? (
            <p className="text-[length:var(--text-caption)] text-secondary">
              Opened {formatAbsoluteDate(unlockDate.toISOString())}
            </p>
          ) : null}
        </section>
      ) : null}

      <LetterRecord capsule={capsule} />

      <CustodyTerms capsule={capsule} addressee={addressee} />

      {recipients.length > 0 ? (
        <section className="flex flex-col gap-3">
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-secondary">
            Addressed to
          </span>
          <ul className="flex flex-col">
            {recipients.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-rule)] py-2.5 first:border-t"
              >
                <span className="text-[length:var(--text-body-s)] text-foreground">
                  {r.displayName || r.email || r.phone}
                </span>
                <span className="text-[length:var(--text-caption)] text-secondary">{r.status.replace(/_/g, ' ')}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        A log is reference material, not part of the reading — so it is
        available and not in the way. `<details>` rather than a tab strip:
        the browser already has a disclosure, and the query stays lazy
        because it is keyed to the open state.
      */}
      <details
        className="border-t border-[var(--color-rule)] pt-4"
        onToggle={(e) => setActivityOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer text-[length:var(--text-body-s)] text-secondary hover:text-foreground">
          Its history
        </summary>
        <ul className="mt-3 flex flex-col">
          {(activityData?.data ?? []).map((entry, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[var(--color-rule)] py-2"
            >
              <span className="text-[length:var(--text-body-s)] text-foreground">{entry.action.replace(/_/g, ' ')}</span>
              <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] tabular-nums text-secondary">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
          {activityOpen && (activityData?.data ?? []).length === 0 ? (
            <li className="py-2 text-[length:var(--text-body-s)] text-secondary">Nothing recorded yet.</li>
          ) : null}
        </ul>
      </details>

      {/*
        Two tiers, separated by a rule. Above it, everything reversible, all
        weighted the same. Below it, the things that cannot be undone, stated
        rather than offered.
      */}
      <div className="flex flex-col gap-4 border-t border-[var(--color-rule)] pt-6">
        <div className="flex flex-wrap gap-2">
          {capsule.state === 'draft' ? (
            <Button size="sm" onClick={() => router.push(`/capsule/${id}/edit`)}>
              Continue writing
            </Button>
          ) : null}
          <QuietAction onClick={() => setTagsOpen(true)}>Tags</QuietAction>
          <QuietAction onClick={() => setCollectionsOpen(true)}>Add to collection</QuietAction>
          <QuietAction
            onClick={() =>
              void runAction(
                () => capsulesApi.duplicate(id).then((r) => router.push(`/capsule/${r.capsule.id}/edit`)),
                'Duplicated',
              )
            }
          >
            Duplicate
          </QuietAction>
          {capsule.state === 'sealed' && !capsule.extendedOnce ? (
            <QuietAction onClick={() => setExtendOpen(true)}>Extend the date</QuietAction>
          ) : null}
          {capsule.archivedAt ? (
            <QuietAction onClick={() => void runAction(() => capsulesApi.unarchive(id), 'Unarchived')}>
              Unarchive
            </QuietAction>
          ) : (
            <QuietAction onClick={() => void runAction(() => capsulesApi.archive(id), 'Archived')}>
              Archive
            </QuietAction>
          )}
          {capsule.trashedAt ? (
            <QuietAction onClick={() => void runAction(() => capsulesApi.restore(id), 'Restored')}>
              Restore
            </QuietAction>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-5">
          {capsule.state === 'sealed' ? (
            <GraveAction onClick={() => setWithdrawOpen(true)}>Withdraw it</GraveAction>
          ) : null}
          {capsule.trashedAt ? (
            <GraveAction onClick={() => setPurgeOpen(true)}>Delete forever</GraveAction>
          ) : (
            <GraveAction onClick={() => void runAction(() => capsulesApi.trash(id), 'Moved to trash')}>
              Move to trash
            </GraveAction>
          )}
        </div>
      </div>

      <Dialog open={extendOpen} onOpenChange={setExtendOpen} title="Extend the date" width="sm">
        <div className="flex flex-col gap-4">
          <p className="text-[length:var(--text-body-s)] text-secondary">
            Once only, and by no more than thirty days. The date can move later, never sooner.
          </p>
          <input
            type="datetime-local"
            value={newUnlockAt}
            onChange={(e) => setNewUnlockAt(e.target.value)}
            className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[length:var(--text-body-s)] text-foreground"
          />
          <Button
            fullWidth
            disabled={!newUnlockAt}
            onClick={() =>
              void runAction(() => capsulesApi.extend(id, { newUnlockAt: new Date(newUnlockAt).toISOString() }), 'Date extended').then(() =>
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
          <p className="text-[length:var(--text-body-s)] text-secondary">
            Anyone who knew it was coming will be told it was withdrawn. Its contents will never be shown, and this
            cannot be undone.
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

      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen} title="Delete this capsule forever?" width="sm">
        <div className="flex flex-col gap-4">
          <p className="text-[length:var(--text-body-s)] text-secondary">
            The letter and everything enclosed are destroyed. We hold no copy and no key, so there is nothing to
            restore afterwards.
          </p>
          <Button
            variant="destructive"
            fullWidth
            onClick={() =>
              void runAction(() => capsulesApi.purge(id).then(() => router.push('/trash')), 'Deleted forever').then(() =>
                setPurgeOpen(false),
              )
            }
          >
            Delete forever
          </Button>
        </div>
      </Dialog>

      <Dialog open={tagsOpen} onOpenChange={setTagsOpen} title="Tags" width="sm">
        <div className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newTagName.trim()) createTagMutation.mutate(newTagName.trim());
            }}
          >
            <input
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag name"
              className="flex-1 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-1.5 text-[length:var(--text-body-s)] text-foreground"
            />
            <Button type="submit" size="sm" variant="secondary" loading={createTagMutation.isPending} disabled={!newTagName.trim()}>
              Create
            </Button>
          </form>

          {allTags.length === 0 ? (
            <p className="text-[length:var(--text-body-s)] text-secondary">No tags yet — create your first one above.</p>
          ) : (
            allTags.map((tag) => {
              const checked = capsule.tagIds.includes(tag.id);
              return (
                <label key={tag.id} className="flex items-center gap-2 text-[length:var(--text-body-s)] text-foreground">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = checked ? capsule.tagIds.filter((t) => t !== tag.id) : [...capsule.tagIds, tag.id];
                      tagsMutation.mutate(next);
                    }}
                  />
                  {tag.name}
                </label>
              );
            })
          )}
        </div>
      </Dialog>

      <Dialog open={collectionsOpen} onOpenChange={setCollectionsOpen} title="Add to collection" width="sm">
        <div className="flex flex-col gap-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newCollectionName.trim()) createCollectionMutation.mutate(newCollectionName.trim());
            }}
          >
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="New collection name"
              className="flex-1 rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-3 py-1.5 text-[length:var(--text-body-s)] text-foreground"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              loading={createCollectionMutation.isPending}
              disabled={!newCollectionName.trim()}
            >
              Create
            </Button>
          </form>

          {allCollections.length === 0 ? (
            <p className="text-[length:var(--text-body-s)] text-secondary">No collections yet — create your first one above.</p>
          ) : (
            allCollections.map((collection) => {
              const isMember = membership.find((m) => m.id === collection.id)?.isMember ?? false;
              return (
                <label key={collection.id} className="flex items-center gap-2 text-[length:var(--text-body-s)] text-foreground">
                  <input
                    type="checkbox"
                    checked={isMember}
                    onChange={() =>
                      void runAction(
                        () =>
                          isMember
                            ? collectionsApi.removeItem(collection.id, id)
                            : collectionsApi.addItem(collection.id, { capsuleId: id }),
                        isMember ? 'Removed from collection' : 'Added to collection',
                      ).then(() => queryClient.invalidateQueries({ queryKey: ['collection-membership', id] }))
                    }
                  />
                  {collection.name}
                </label>
              );
            })
          )}
        </div>
      </Dialog>
    </div>
  );
}
