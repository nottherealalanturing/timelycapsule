import type { CreateGuestCapsuleRequest, GuestCapsuleResponse, PatchGuestCapsuleRequest } from '@tc/contracts';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { audit } from '../../db/audit.js';
import { ApiError } from '../../lib/errors.js';
import { GUEST_MEDIA_RETENTION_AFTER_UNLOCK_MS, GUEST_STORAGE_ALLOWANCE_BYTES } from '../../lib/guest-limits.js';
import { capsuleRecipients, capsules, guestSessions, mediaItems, scheduledActions } from '../../db/schema/index.js';
import { buildSealedEntitlementSnapshot, generateUniquePublicId, scheduleMediaRelease, type PlanLimits } from '../capsules/index.js';
import { generateAccessToken, hashAccessToken } from '../recipients/index.js';
import { generateGuestToken, hashGuestToken } from './token.js';

type GuestSessionRow = typeof guestSessions.$inferSelect;
type CapsuleRow = typeof capsules.$inferSelect;

const MIN_UNLOCK_MS = 5 * 60 * 1000;
const MAX_UNLOCK_MS = 365 * 24 * 60 * 60 * 1000; // +1 year (01 §4.1b) — the guest ceiling, well under the owner +50yr bound

/**
 * The `PlanLimits` shape `buildSealedEntitlementSnapshot` expects, filled in
 * with Guest's actual terms (`lib/guest-limits.ts`) plus honest values for
 * the fields a snapshot doesn't read — Guest genuinely has one capsule, one
 * recipient (the anonymous link-holder row `createGuestCapsule` creates),
 * and no seals (`capabilities.conditions` is already `false` for Guest in
 * the composer, so these can never actually be set). Not `PLAN_LIMITS` and
 * never merged into it — Guest is not a plan.
 */
const GUEST_PLAN_LIMITS: PlanLimits = {
  activeSealedCapsules: 1,
  storageBytes: GUEST_STORAGE_ALLOWANCE_BYTES,
  placeOrPassphraseSealsPerCapsule: 0,
  recipientsPerCapsule: 1,
  maxFileSizeBytes: GUEST_STORAGE_ALLOWANCE_BYTES,
  mediaRetentionAfterUnlockMs: GUEST_MEDIA_RETENTION_AFTER_UNLOCK_MS,
};

export async function createGuestSession(db: Database, ip: string | undefined): Promise<{ guestToken: string }> {
  const guestToken = generateGuestToken();
  await db.insert(guestSessions).values({ tokenHash: hashGuestToken(guestToken), ip });
  return { guestToken };
}

export async function findGuestSessionOrThrow(db: Database, rawToken: string): Promise<GuestSessionRow> {
  const [session] = await db.select().from(guestSessions).where(eq(guestSessions.tokenHash, hashGuestToken(rawToken))).limit(1);
  if (!session || session.claimedAt) {
    throw ApiError.guestSessionInvalid();
  }
  await db.update(guestSessions).set({ lastUsedAt: new Date() }).where(eq(guestSessions.id, session.id));
  return session;
}

function toGuestCapsuleResponse(row: CapsuleRow, recipientToken?: string): GuestCapsuleResponse {
  return {
    id: row.id,
    publicId: row.publicId,
    state: row.state as GuestCapsuleResponse['state'],
    title: row.title,
    cover: row.cover as GuestCapsuleResponse['cover'],
    unlockAt: row.unlockAt ? row.unlockAt.toISOString() : null,
    sealedAt: row.sealedAt ? row.sealedAt.toISOString() : null,
    ...(recipientToken ? { recipientToken } : {}),
  };
}

async function findGuestCapsuleOrThrow(db: Database, sessionId: string, capsuleId: string): Promise<CapsuleRow> {
  const [row] = await db.select().from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
  if (!row || row.guestSessionId !== sessionId) {
    throw ApiError.notFound('Capsule not found');
  }
  return row;
}

/**
 * 1 capsule (draft or sealed) per guest session — matches the UX copy
 * ("One per traveler — free accounts get five") more than the literal
 * "1 draft + 1 sealed" reading of 01 §4.1b: a session that already has a
 * sealed capsule cannot start a second draft either, since the guest's one
 * shareable capsule already exists.
 */
export async function createGuestCapsule(db: Database, sessionId: string, input: CreateGuestCapsuleRequest): Promise<GuestCapsuleResponse> {
  const [existing] = await db.select({ id: capsules.id }).from(capsules).where(eq(capsules.guestSessionId, sessionId)).limit(1);
  if (existing) {
    throw ApiError.guestCapsuleLimit();
  }

  const publicId = await generateUniquePublicId(db);
  const [row] = (await db
    .insert(capsules)
    .values({ guestSessionId: sessionId, type: 'micro', publicId, state: 'draft', title: input.title, cover: input.cover, allowDownload: true })
    .returning()) as [CapsuleRow];

  // The anonymous link-holder — a single un-named capsule_recipients row
  // reuses T-13/T-15's entire scheduling+reveal pipeline unmodified for
  // guest capsules (no email, so the scheduler's recipient_unlock handler
  // is a silent no-op; the guest shares the link themselves).
  const rawToken = generateAccessToken();
  await db.insert(capsuleRecipients).values({ capsuleId: row.id, accessTokenHash: hashAccessToken(rawToken), status: 'notified' });

  await audit(db, { actorType: 'guest', actorId: sessionId, action: 'capsule.created', subjectType: 'capsule', subjectId: row.id });
  return toGuestCapsuleResponse(row, rawToken);
}

export async function patchGuestCapsule(
  db: Database,
  sessionId: string,
  capsuleId: string,
  input: PatchGuestCapsuleRequest,
): Promise<GuestCapsuleResponse> {
  const row = await findGuestCapsuleOrThrow(db, sessionId, capsuleId);
  if (row.state !== 'draft') {
    throw ApiError.guestCapsuleLocked();
  }

  const contentDocEnc = input.contentDocEnc !== undefined ? (input.contentDocEnc ? Buffer.from(input.contentDocEnc, 'base64') : null) : undefined;
  const unlockAt = input.unlockAt !== undefined ? (input.unlockAt ? new Date(input.unlockAt) : null) : undefined;

  const [updated] = (await db
    .update(capsules)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.cover !== undefined ? { cover: input.cover } : {}),
      ...(input.teaser !== undefined ? { teaser: input.teaser } : {}),
      ...(contentDocEnc !== undefined ? { contentDocEnc } : {}),
      ...(unlockAt !== undefined ? { unlockAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  return toGuestCapsuleResponse(updated);
}

export async function sealGuestCapsule(db: Database, sessionId: string, capsuleId: string): Promise<GuestCapsuleResponse> {
  const row = await findGuestCapsuleOrThrow(db, sessionId, capsuleId);
  if (row.state !== 'draft') {
    throw ApiError.guestCapsuleLocked();
  }
  if (!row.contentDocEnc) {
    throw ApiError.validationFailed({ contentDocEnc: 'Write something before sealing' });
  }
  if (!row.unlockAt) {
    throw ApiError.validationFailed({ unlockAt: 'unlockAt must be set before sealing' });
  }

  const deltaMs = row.unlockAt.getTime() - Date.now();
  if (deltaMs < MIN_UNLOCK_MS || deltaMs > MAX_UNLOCK_MS) {
    throw ApiError.unlockInPast('Guest capsules must unlock between 5 minutes and 1 year from now');
  }

  // M5 — the same media-readiness gate `capsules/lifecycle.ts`'s owner
  // `sealCapsule` has always had. Guest media didn't exist when this
  // function was first written, so nothing here ever checked it; without
  // this a guest could seal a capsule with a photo still mid-transfer.
  const media = await db.select({ status: mediaItems.status }).from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
  if (media.some((m) => m.status !== 'ready')) {
    throw ApiError.uploadIncomplete();
  }

  const now = new Date();

  // --- M5: the promise this guest capsule is being sealed with -----------
  //
  // Guest gets an entitlement snapshot too, and for exactly the reason M4's
  // own doc comment on a *missing* snapshot gives: absent reads as
  // *forever*. Without writing one here, every guest-sealed capsule with
  // media would silently get the most generous retention in the entire
  // product — the opposite of "Guest is intentionally constrained" — purely
  // as an accident of which code path sealed it. `hasMedia` gates the same
  // way the owner path does: nothing to release, nothing to promise.
  const hasMedia = media.length > 0;
  const retentionUntil = hasMedia ? new Date(row.unlockAt.getTime() + GUEST_MEDIA_RETENTION_AFTER_UNLOCK_MS) : null;

  if (retentionUntil && retentionUntil.getTime() < row.unlockAt.getTime()) {
    throw ApiError.validationFailed({ retentionUntil: 'Media retention cannot end before the capsule opens' });
  }

  const snapshot = buildSealedEntitlementSnapshot({
    plan: 'guest',
    limits: GUEST_PLAN_LIMITS,
    sealedAt: now,
    retentionUntil,
    hasMedia,
    maxHorizonMs: MAX_UNLOCK_MS,
  });

  const [sealed] = (await db
    .update(capsules)
    .set({
      state: 'sealed',
      sealedAt: now,
      updatedAt: now,
      sealedEntitlementSnapshot: snapshot,
      mediaRetentionUntil: retentionUntil,
    })
    .where(eq(capsules.id, capsuleId))
    .returning()) as [CapsuleRow];

  // Delivers via the standard T-13/T-15 pipeline (01 §4.1b hard rule 5) —
  // no reminders scheduled here since there's no email to remind and no
  // owner dashboard to link back to yet.
  await db.insert(scheduledActions).values({
    kind: 'capsule_unlock',
    subjectId: capsuleId,
    runAt: row.unlockAt,
    idempotencyKey: `capsule_unlock:${capsuleId}`,
  });

  // Same warning/release schedule M4 gives an authenticated seal — this
  // guest capsule now carries exactly the same retention machinery, not a
  // second implementation of it.
  await scheduleMediaRelease(db, capsuleId, retentionUntil, now);

  await audit(db, { actorType: 'guest', actorId: sessionId, action: 'capsule.sealed', subjectType: 'capsule', subjectId: capsuleId });
  return toGuestCapsuleResponse(sealed);
}

export async function getGuestCapsule(db: Database, sessionId: string, capsuleId: string): Promise<GuestCapsuleResponse> {
  const row = await findGuestCapsuleOrThrow(db, sessionId, capsuleId);
  return toGuestCapsuleResponse(row);
}
