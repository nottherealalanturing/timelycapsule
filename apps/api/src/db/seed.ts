import '../env.js';
import { randomBytes, createHash } from 'node:crypto';
import { db, pool } from './client.js';
import { audit } from './audit.js';
import {
  capsuleRecipients,
  capsules,
  capsuleTags,
  contacts,
  entitlements,
  favorites,
  mediaItems,
  notificationPrefs,
  scheduledActions,
  tags,
  users,
} from './schema/index.js';

const FREE_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024; // 01-PRODUCT.md §20 free tier

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function main() {
  // Dev-only reset — scoped to seedable tables, safe to rerun.
  await pool.query(
    'TRUNCATE TABLE users, capsules, capsule_recipients, media_items, tags, capsule_tags, favorites, contacts, entitlements, notification_prefs, scheduled_actions, audit_events CASCADE',
  );

  const [maya] = await db
    .insert(users)
    .values({
      email: 'maya@example.com',
      displayName: 'Maya',
      status: 'active',
      emailVerifiedAt: new Date(),
      timezone: 'America/New_York',
    })
    .returning();

  const [david] = await db
    .insert(users)
    .values({
      email: 'david@example.com',
      displayName: 'David',
      status: 'active',
      emailVerifiedAt: new Date(),
      timezone: 'America/Los_Angeles',
    })
    .returning();

  if (!maya || !david) throw new Error('seed: user insert failed');

  await db.insert(entitlements).values([
    { userId: maya.id, plan: 'free', storageQuotaBytes: FREE_STORAGE_QUOTA_BYTES },
    { userId: david.id, plan: 'free', storageQuotaBytes: FREE_STORAGE_QUOTA_BYTES },
  ]);

  await db.insert(notificationPrefs).values([
    { userId: maya.id, prefs: { unlock: { push: true, email: true, sms: false } } },
    { userId: david.id, prefs: { unlock: { push: true, email: true, sms: false } } },
  ]);

  await db.insert(contacts).values({
    ownerId: david.id,
    name: 'Priya',
    email: 'priya@example.com',
    linkedUserId: null,
  });

  const [futureLetterTag] = await db
    .insert(tags)
    .values({ userId: maya.id, name: 'future-self' })
    .returning();

  // Draft self-capsule — untouched, mid-composition.
  await db.insert(capsules).values({
    publicId: 'TC-DRAFT001',
    ownerId: maya.id,
    type: 'self',
    state: 'draft',
    title: 'Notes to 2028 me',
  });

  // Sealed self-capsule, unlocking ~1 year out.
  const unlockAt = new Date();
  unlockAt.setFullYear(unlockAt.getFullYear() + 1);

  const [sealedCapsule] = await db
    .insert(capsules)
    .values({
      publicId: 'TC-SEALED01',
      ownerId: maya.id,
      type: 'self',
      state: 'sealed',
      title: 'Open on your birthday',
      unlockMode: 'absolute',
      unlockAt,
      sealedAt: new Date(),
      sizeBytes: 2_400_000,
    })
    .returning();

  if (!sealedCapsule) throw new Error('seed: capsule insert failed');

  if (futureLetterTag) {
    await db
      .insert(capsuleTags)
      .values({ capsuleId: sealedCapsule.id, tagId: futureLetterTag.id });
  }

  await db.insert(favorites).values({ userId: maya.id, capsuleId: sealedCapsule.id });

  const rawToken = randomBytes(20).toString('base64url');
  await db.insert(capsuleRecipients).values({
    capsuleId: sealedCapsule.id,
    userId: maya.id,
    email: maya.email,
    displayName: maya.displayName,
    accessTokenHash: hashToken(rawToken),
    status: 'added',
  });

  await db.insert(mediaItems).values({
    capsuleId: sealedCapsule.id,
    uploaderId: maya.id,
    kind: 'image',
    storageKey: 'seed/placeholder.jpg',
    mime: 'image/jpeg',
    sizeBytes: 2_400_000,
    position: 0,
    status: 'ready',
  });

  // The row that ties a sealed capsule to the scheduler (plan/03-ARCHITECTURE.md §10).
  await db.insert(scheduledActions).values({
    kind: 'capsule_unlock',
    subjectId: sealedCapsule.id,
    runAt: unlockAt,
    idempotencyKey: `capsule_unlock:${sealedCapsule.id}`,
  });

  await audit(db, {
    actorType: 'user',
    actorId: maya.id,
    action: 'capsule.sealed',
    subjectType: 'capsule',
    subjectId: sealedCapsule.id,
    metadata: { seedRun: true },
  });

  console.log('Seed complete:', {
    users: [maya.email, david.email],
    capsules: ['TC-DRAFT001 (draft)', 'TC-SEALED01 (sealed)'],
  });

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
