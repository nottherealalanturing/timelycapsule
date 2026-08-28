import type { CapsuleListItem, ReceivedCapsule } from '@tc/contracts';
import { capsuleStateColors } from './tokens';

/**
 * The one normalized shape `CapsuleRow` renders. It exists because the two
 * backend list shapes disagree in ways a component shouldn't have to know
 * about: `CapsuleListItem` (owned, from `GET /capsules`) keys itself by
 * `id` and carries a real `CapsuleState`; `ReceivedCapsule` (from
 * `GET /received`) keys itself by `capsuleId` and carries a `section`
 * (`upcoming|waiting|opened`) instead — there is no server-side concept
 * shared between the two. `fromCapsuleListItem`/`fromReceivedCapsule` are
 * the only places that know either backend shape exists; `CapsuleRow`
 * itself only ever sees this type.
 *
 * Neither `CapsuleListItem` nor `ReceivedCapsule` carries `contentDocEnc`/
 * `ownerKeyWrap` (the list endpoints omit ciphertext entirely — see
 * `CapsuleListItemSchema`'s `.omit()` in packages/contracts/src/capsules.ts),
 * so this model — and anything built on it — is structurally incapable of
 * decrypting anything. A draft capsule with no title yet (the "5th state":
 * `draft`, no content written) is just a row with `title: null`, handled
 * below like any other nullable field, never as an error.
 */
export interface CapsuleRowItem {
  id: string;
  title: string | null;
  teaser: string | null;
  /** "From {senderName}" for received capsules; null for owned (no sender to name). */
  subtitle: string | null;
  statusLabel: string;
  statusColor: string;
  /** Pre-formatted, e.g. "Aug 28, 2026" — null when no relevant date exists yet. */
  dateLabel: string | null;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const OWNED_STATUS_LABEL: Record<CapsuleListItem['state'], string> = {
  draft: 'Draft',
  sealing: 'Sealing',
  sealed: 'Sealed',
  unlocked: 'Unlocked',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
};

/** The most relevant single date for an owned capsule's current state. */
function ownedDate(item: CapsuleListItem): string | null {
  switch (item.state) {
    case 'draft':
      return item.updatedAt;
    case 'sealing':
      return item.sealDeadlineAt ?? item.updatedAt;
    case 'sealed':
      return item.unlockAt ?? item.sealedAt;
    case 'unlocked':
      return item.unlockAt ?? item.sealedAt;
    case 'expired':
      return item.expiredAt ?? item.unlockAt;
    case 'withdrawn':
      return item.withdrawnAt ?? item.updatedAt;
  }
}

export function fromCapsuleListItem(item: CapsuleListItem): CapsuleRowItem {
  return {
    id: item.id,
    title: item.title,
    teaser: item.teaser,
    subtitle: null,
    statusLabel: OWNED_STATUS_LABEL[item.state],
    statusColor: capsuleStateColors[item.state],
    dateLabel: formatDate(ownedDate(item)),
  };
}

/**
 * `section` has no server-defined color of its own, so it borrows the
 * nearest owned-state meaning from `capsuleStateColors` rather than
 * inventing a second palette: `upcoming` (still sealed, counting down) reads
 * as `sealed` (brass, the one WAITING color); `waiting` (unlocked, not yet
 * opened — see apps/web/src/app/(app)/received/page.tsx's `SECTION_HEADING`,
 * "Ready to open") and `opened` both read as `unlocked` (success, "arrived")
 * since nothing in this product's state model distinguishes "arrived" from
 * "arrived and read."
 */
const RECEIVED_STATUS: Record<ReceivedCapsule['section'], { label: string; color: string }> = {
  upcoming: { label: 'Still sealed', color: capsuleStateColors.sealed },
  waiting: { label: 'Ready to open', color: capsuleStateColors.unlocked },
  opened: { label: 'Opened', color: capsuleStateColors.unlocked },
};

/** The most relevant single date for a received capsule's current section. */
function receivedDate(item: ReceivedCapsule): string | null {
  switch (item.section) {
    case 'upcoming':
    case 'waiting':
      return item.unlockAt;
    case 'opened':
      return item.firstOpenedAt ?? item.unlockAt;
  }
}

export function fromReceivedCapsule(item: ReceivedCapsule): CapsuleRowItem {
  const status = RECEIVED_STATUS[item.section];
  return {
    id: item.capsuleId,
    title: item.title,
    teaser: item.teaser,
    subtitle: `From ${item.senderName}`,
    statusLabel: status.label,
    statusColor: status.color,
    dateLabel: formatDate(receivedDate(item)),
  };
}
