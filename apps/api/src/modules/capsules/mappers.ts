import type { Capsule, CapsuleListItem, Seal } from '@tc/contracts';
import type { capsules } from '../../db/schema/index.js';

type CapsuleRow = typeof capsules.$inferSelect;

function isoOrNull(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function base64OrNull(buf: Buffer | null): string | null {
  return buf ? buf.toString('base64') : null;
}

export function toCapsule(row: CapsuleRow): Capsule {
  return {
    id: row.id,
    publicId: row.publicId,
    type: row.type,
    state: row.state,
    title: row.title,
    cover: row.cover as Capsule['cover'],
    teaser: row.teaser,
    contentDocEnc: base64OrNull(row.contentDocEnc),
    ownerKeyWrap: base64OrNull(row.ownerKeyWrap),
    passphraseHint: row.passphraseHint,
    sizeBytes: row.sizeBytes,
    unlockMode: row.unlockMode,
    unlockAt: isoOrNull(row.unlockAt),
    unlockLocal: row.unlockLocal as Capsule['unlockLocal'],
    sealDeadlineAt: isoOrNull(row.sealDeadlineAt),
    sealedAt: isoOrNull(row.sealedAt),
    extendedOnce: row.extendedOnce ?? false,
    seals: (row.seals ?? []) as Seal[],
    allowDownload: row.allowDownload ?? true,
    recipientsVisible: row.recipientsVisible ?? false,
    announceOnSeal: row.announceOnSeal ?? true,
    requireRecipientVerification: row.requireRecipientVerification ?? false,
    replyPrompt: row.replyPrompt,
    location: row.location as Capsule['location'],
    expiresAfter: row.expiresAfter,
    expiryStrict: row.expiryStrict ?? false,
    expiredAt: isoOrNull(row.expiredAt),
    archivedAt: isoOrNull(row.archivedAt),
    trashedAt: isoOrNull(row.trashedAt),
    purgeAfter: isoOrNull(row.purgeAfter),
    withdrawnAt: isoOrNull(row.withdrawnAt),
    legacyConfig: row.legacyConfig as Capsule['legacyConfig'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCapsuleListItem(row: CapsuleRow): CapsuleListItem {
  const { contentDocEnc: _contentDocEnc, ownerKeyWrap: _ownerKeyWrap, ...rest } = toCapsule(row);
  return rest;
}
