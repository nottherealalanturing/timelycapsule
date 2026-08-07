import { randomInt } from 'node:crypto';
import type {
  Cover,
  PlaceCheckResponse,
  ReactRequest,
  ReportRequest,
  RevealResponse,
  SealStatus,
} from '@tc/contracts';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import {
  capsuleRecipients,
  capsules,
  mediaItems,
  reactions,
  recipientOtpCodes,
  users,
} from '../../db/schema/index.js';
import { hashAccessToken } from '../recipients/index.js';
import { sendOpenedNotice, sendReactionReceived, sendVerifyEmailCode } from '../email/index.js';
import { writeNotification } from '../notifications/index.js';
import { getStorageAdapter } from '../media/index.js';
import { issueGateToken, verifyGateToken, type GateSealType } from './gate-token.js';

type CapsuleRow = typeof capsules.$inferSelect;
type RecipientRow = typeof capsuleRecipients.$inferSelect;

const VIEW_URL_TTL_SECONDS = 15 * 60;
const OTP_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const EARTH_RADIUS_M = 6371000;

export interface GateTokens {
  place?: string;
  identity?: string;
}

async function findRecipientOrThrow(db: Database, rawToken: string): Promise<{ recipient: RecipientRow; capsule: CapsuleRow }> {
  const tokenHash = hashAccessToken(rawToken);
  const [recipient] = await db.select().from(capsuleRecipients).where(eq(capsuleRecipients.accessTokenHash, tokenHash)).limit(1);
  // Masked as a plain 404 — a suppressed/nonexistent token must look identical to the sender-side "masked success" pattern (T-09).
  if (!recipient || recipient.status === 'blocked_suppressed') {
    throw ApiError.notFound('Capsule not found');
  }
  const [capsule] = await db.select().from(capsules).where(eq(capsules.id, recipient.capsuleId)).limit(1);
  if (!capsule) {
    throw ApiError.notFound('Capsule not found');
  }
  return { recipient, capsule };
}

function hasSealType(capsule: CapsuleRow, type: 'place' | 'passphrase' | 'identity'): boolean {
  const seals = (capsule.seals ?? []) as { type: string }[];
  return seals.some((s) => s.type === type);
}

function requiresIdentity(capsule: CapsuleRow): boolean {
  return Boolean(capsule.requireRecipientVerification) || hasSealType(capsule, 'identity');
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance (meters) + initial bearing (degrees) from (fromLat,fromLng) to (toLat,toLng). */
function distanceAndBearing(fromLat: number, fromLng: number, toLat: number, toLng: number): { distanceM: number; bearingDeg: number } {
  const phi1 = toRad(fromLat);
  const phi2 = toRad(toLat);
  const dPhi = toRad(toLat - fromLat);
  const dLambda = toRad(toLng - fromLng);

  const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  const distanceM = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const bearingDeg = (toDeg(Math.atan2(y, x)) + 360) % 360;

  return { distanceM, bearingDeg };
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function buildSealStatuses(capsule: CapsuleRow, gates: GateTokens, recipientId: string): SealStatus[] {
  const seals = (capsule.seals ?? []) as Array<{ type: string; config: Record<string, unknown> }>;
  const statuses: SealStatus[] = [];

  const place = seals.find((s) => s.type === 'place');
  if (place) {
    statuses.push({
      type: 'place',
      satisfied: Boolean(gates.place && verifyGateToken(gates.place, recipientId, 'place')),
      name: String(place.config.name),
      radiusM: Number(place.config.radiusM),
    });
  }

  const passphrase = seals.find((s) => s.type === 'passphrase');
  if (passphrase) {
    // No server-side "satisfied" concept — the client either can or can't unwrap the key with what it's given.
    statuses.push({ type: 'passphrase', satisfied: false, hint: String(passphrase.config.hint), wrappedKeyB64: String(passphrase.config.wrappedKeyB64) });
  }

  if (requiresIdentity(capsule)) {
    statuses.push({ type: 'identity', satisfied: Boolean(gates.identity && verifyGateToken(gates.identity, recipientId, 'identity')) });
  }

  return statuses;
}

async function ownerDashboardUrl(capsuleId: string): Promise<string> {
  return `${process.env.APP_URL ?? 'http://localhost:3001'}/capsule/${capsuleId}`;
}

export async function getReveal(db: Database, rawToken: string, gates: GateTokens): Promise<RevealResponse> {
  const { recipient, capsule } = await findRecipientOrThrow(db, rawToken);

  if (capsule.state === 'withdrawn') return { status: 'withdrawn' };
  if (capsule.state === 'expired') return { status: 'expired' };

  const [owner] = capsule.ownerId
    ? await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, capsule.ownerId)).limit(1)
    : [];
  const senderName = owner?.displayName ?? 'Someone';

  if (capsule.state !== 'unlocked') {
    if (recipient.status === 'added' || recipient.status === 'invited' || recipient.status === 'notified') {
      await db.update(capsuleRecipients).set({ status: 'viewed_locked', lastViewedAt: new Date() }).where(eq(capsuleRecipients.id, recipient.id));
    } else {
      await db.update(capsuleRecipients).set({ lastViewedAt: new Date() }).where(eq(capsuleRecipients.id, recipient.id));
    }

    return {
      status: 'locked',
      publicId: capsule.publicId,
      senderName,
      cover: capsule.cover as Cover | null,
      teaser: capsule.teaser,
      unlockAt: capsule.unlockAt ? capsule.unlockAt.toISOString() : null,
      unlockLocal: capsule.unlockLocal as { date: string; time: string; tz: string } | null,
      seals: buildSealStatuses(capsule, gates, recipient.id),
      recipientDisplayName: recipient.displayName,
      sealedAt: capsule.sealedAt ? capsule.sealedAt.toISOString() : null,
    };
  }

  // Unlocked: gate on every active non-time, non-passphrase seal before releasing content.
  const sealStatuses = buildSealStatuses(capsule, gates, recipient.id);
  const unmet = sealStatuses.find((s) => s.type !== 'passphrase' && !s.satisfied);
  if (unmet) {
    throw ApiError.sealNotSatisfied(unmet.type);
  }

  const mediaRows = await db.select().from(mediaItems).where(and(eq(mediaItems.capsuleId, capsule.id), eq(mediaItems.status, 'ready')));
  const adapter = getStorageAdapter();
  const media = await Promise.all(
    mediaRows
      .filter((m) => m.storageKey)
      .map(async (m) => ({
        id: m.id,
        kind: m.kind,
        caption: m.caption,
        position: m.position,
        encMeta: m.encMeta as Record<string, unknown> | null,
        mime: m.mime,
        originalName: m.originalName,
        viewUrl: await adapter.getSignedGetUrl(m.storageKey!, { expiresInSeconds: VIEW_URL_TTL_SECONDS, asAttachment: false }),
      })),
  );

  const alreadyOpened = recipient.status === 'opened';
  if (!alreadyOpened) {
    await db
      .update(capsuleRecipients)
      .set({ status: 'opened', firstOpenedAt: new Date(), lastViewedAt: new Date() })
      .where(eq(capsuleRecipients.id, recipient.id));
    await audit(db, { actorType: 'recipient', actorId: recipient.id, action: 'recipient.opened', subjectType: 'capsule', subjectId: capsule.id });

    // Best-effort: the recipient's own reveal must never fail because the owner's notification email did.
    // Guest capsules (capsule.ownerId still null pre-claim) have no owner to notify — skip entirely.
    try {
      if (capsule.ownerId) {
      await writeNotification(db, {
        userId: capsule.ownerId,
        category: 'social',
        title: `${recipient.displayName ?? 'Someone'} opened your capsule`,
        data: { capsuleId: capsule.id, recipientId: recipient.id },
      });
      if (owner) {
        const [ownerUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, capsule.ownerId)).limit(1);
        if (ownerUser) {
          await sendOpenedNotice(db, ownerUser.email, {
            recipientName: recipient.displayName ?? recipient.email ?? 'Someone',
            capsuleTitle: capsule.title,
            dashboardUrl: await ownerDashboardUrl(capsule.id),
          });
        }
      }
      }
    } catch {
      // logged inside sendOpenedNotice's own ledger row; nothing further to do here.
    }
  } else {
    await db.update(capsuleRecipients).set({ lastViewedAt: new Date() }).where(eq(capsuleRecipients.id, recipient.id));
  }

  return {
    status: 'unlocked',
    publicId: capsule.publicId,
    senderName,
    cover: capsule.cover as Cover | null,
    contentDocEnc: capsule.contentDocEnc ? capsule.contentDocEnc.toString('base64') : null,
    media,
    location: capsule.location as { lat: number; lng: number; name: string } | null,
    replyPrompt: capsule.replyPrompt,
    passphraseSeal: (() => {
      const seal = sealStatuses.find((s): s is Extract<typeof s, { type: 'passphrase' }> => s.type === 'passphrase');
      return seal ? { hint: seal.hint, wrappedKeyB64: seal.wrappedKeyB64 } : null;
    })(),
    allowDownload: Boolean(capsule.allowDownload),
    recipientsVisible: Boolean(capsule.recipientsVisible),
    requireIdentityVerification: requiresIdentity(capsule),
    identityVerified: Boolean(gates.identity && verifyGateToken(gates.identity, recipient.id, 'identity')),
    alreadyOpened,
  };
}

export async function requestIdentityCode(db: Database, rawToken: string): Promise<void> {
  const { recipient } = await findRecipientOrThrow(db, rawToken);
  if (!recipient.email) {
    throw ApiError.validationFailed({ code: 'Identity verification requires an email address on file' });
  }

  await db.delete(recipientOtpCodes).where(and(eq(recipientOtpCodes.recipientId, recipient.id), isNull(recipientOtpCodes.usedAt)));

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const { createHash } = await import('node:crypto');
  await db.insert(recipientOtpCodes).values({
    recipientId: recipient.id,
    codeHash: createHash('sha256').update(code).digest('hex'),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendVerifyEmailCode(db, recipient.email, code);
}

export async function verifyIdentityCode(db: Database, rawToken: string, code: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const { recipient } = await findRecipientOrThrow(db, rawToken);

  const [row] = await db
    .select()
    .from(recipientOtpCodes)
    .where(and(eq(recipientOtpCodes.recipientId, recipient.id), isNull(recipientOtpCodes.usedAt), gt(recipientOtpCodes.expiresAt, new Date())))
    .orderBy(desc(recipientOtpCodes.createdAt))
    .limit(1);

  if (!row) throw ApiError.invalidOrExpiredCode();

  if (row.codeHash !== createHash('sha256').update(code).digest('hex')) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await db.update(recipientOtpCodes).set({ usedAt: new Date(), attempts }).where(eq(recipientOtpCodes.id, row.id));
    } else {
      await db.update(recipientOtpCodes).set({ attempts }).where(eq(recipientOtpCodes.id, row.id));
    }
    throw ApiError.invalidOrExpiredCode();
  }

  await db.update(recipientOtpCodes).set({ usedAt: new Date() }).where(eq(recipientOtpCodes.id, row.id));
  await db.update(capsuleRecipients).set({ verifiedAt: new Date() }).where(eq(capsuleRecipients.id, recipient.id));

  return issueGateToken(recipient.id, 'identity');
}

export async function placeCheck(db: Database, rawToken: string, lat: number, lng: number): Promise<PlaceCheckResponse> {
  const { recipient, capsule } = await findRecipientOrThrow(db, rawToken);
  const seals = (capsule.seals ?? []) as Array<{ type: string; config: { lat: number; lng: number; radiusM: number } }>;
  const place = seals.find((s) => s.type === 'place');
  if (!place) throw ApiError.validationFailed({ seal: 'This capsule has no Place seal' });

  const { distanceM, bearingDeg } = distanceAndBearing(lat, lng, place.config.lat, place.config.lng);
  const withinRange = distanceM <= place.config.radiusM;

  return {
    withinRange,
    distanceM: Math.round(distanceM),
    bearingDeg: Math.round(bearingDeg),
    gateToken: withinRange ? issueGateToken(recipient.id, 'place' as GateSealType) : null,
  };
}

export async function setReminderOptIn(db: Database, rawToken: string, enabled: boolean): Promise<void> {
  const { recipient } = await findRecipientOrThrow(db, rawToken);
  await db.update(capsuleRecipients).set({ reminderOptIn: { enabled } }).where(eq(capsuleRecipients.id, recipient.id));
}

export async function react(db: Database, rawToken: string, input: ReactRequest): Promise<void> {
  const { recipient, capsule } = await findRecipientOrThrow(db, rawToken);
  if (capsule.state !== 'unlocked') throw ApiError.forbidden('Cannot react before the capsule unlocks');

  await db.insert(reactions).values({ capsuleId: capsule.id, recipientId: recipient.id, emoji: input.emoji, note: input.note });

  try {
    if (capsule.ownerId) {
      await writeNotification(db, {
        userId: capsule.ownerId,
        category: 'social',
        title: `${recipient.displayName ?? 'Someone'} replied: "${input.emoji}"`,
        body: input.note ?? undefined,
        data: { capsuleId: capsule.id, recipientId: recipient.id },
      });
      const [ownerUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, capsule.ownerId)).limit(1);
      if (ownerUser) {
        await sendReactionReceived(db, ownerUser.email, {
          recipientName: recipient.displayName ?? recipient.email ?? 'Someone',
          emoji: input.emoji,
          note: input.note ?? null,
          dashboardUrl: await ownerDashboardUrl(capsule.id),
        });
      }
    }
  } catch {
    // Best-effort — the recipient's reaction is already saved regardless of whether the owner's notice sends.
  }
}

export async function saveToAccount(db: Database, rawToken: string, userId: string): Promise<void> {
  const { recipient } = await findRecipientOrThrow(db, rawToken);
  if (recipient.userId && recipient.userId !== userId) {
    throw ApiError.alreadySaved();
  }
  await db.update(capsuleRecipients).set({ userId }).where(eq(capsuleRecipients.id, recipient.id));
}

export async function report(db: Database, rawToken: string, input: ReportRequest): Promise<void> {
  const { recipient, capsule } = await findRecipientOrThrow(db, rawToken);
  await audit(db, {
    actorType: 'recipient',
    actorId: recipient.id,
    action: 'capsule.reported',
    subjectType: 'capsule',
    subjectId: capsule.id,
    metadata: { reason: input.reason, details: input.details },
  });
}

/** Nightly-equivalent, but done lazily on first reveal-page visit rather than a scheduled job — a recipient's tz can't be known until they load the page. */
export async function inferTimezone(db: Database, rawToken: string, tz: string): Promise<void> {
  const { recipient, capsule } = await findRecipientOrThrow(db, rawToken);
  await db.update(capsuleRecipients).set({ tzInferred: tz }).where(eq(capsuleRecipients.id, recipient.id));

  if (capsule.unlockMode !== 'recipient_local' || !capsule.unlockLocal) return;
  const local = capsule.unlockLocal as { date: string; time: string };
  const resolved = DateTime.fromISO(`${local.date}T${local.time}`, { zone: tz });
  if (!resolved.isValid) return;

  await db.update(capsuleRecipients).set({ resolvedUnlockAt: resolved.toJSDate() }).where(eq(capsuleRecipients.id, recipient.id));
}
