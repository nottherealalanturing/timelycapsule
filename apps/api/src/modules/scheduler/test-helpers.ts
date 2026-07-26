import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import type { Database } from '../../db/client.js';
import { capsuleRecipients, capsules, scheduledActions, users } from '../../db/schema/index.js';
import type { ActionJob, QueueName } from './queue.js';

type UserRow = typeof users.$inferSelect;
type CapsuleRow = typeof capsules.$inferSelect;
type RecipientRow = typeof capsuleRecipients.$inferSelect;
type ScheduledActionRow = typeof scheduledActions.$inferSelect;

/** In-memory stand-in for pg-boss's `.sendAfter()` — scheduler unit tests assert against sent jobs without a live queue. */
export class FakeQueue {
  sent: { queue: QueueName; job: ActionJob; runAt: Date }[] = [];

  async sendAfter(queue: QueueName, job: ActionJob, _options: unknown, runAt: Date): Promise<void> {
    this.sent.push({ queue, job, runAt });
  }
}

export function asQueue(fake: FakeQueue): PgBoss {
  return fake as unknown as PgBoss;
}

export async function createTestUser(db: Database, overrides: Partial<typeof users.$inferInsert> = {}): Promise<UserRow> {
  const [row] = (await db
    .insert(users)
    .values({
      email: `scheduler-test-${randomUUID()}@example.com`,
      displayName: 'Scheduler Test User',
      status: 'active',
      ...overrides,
    })
    .returning()) as [UserRow];
  return row;
}

export async function createTestCapsule(db: Database, ownerId: string, overrides: Partial<typeof capsules.$inferInsert> = {}): Promise<CapsuleRow> {
  const [row] = (await db
    .insert(capsules)
    .values({
      ownerId,
      type: 'self',
      publicId: randomUUID().slice(0, 8).toUpperCase(),
      state: 'sealed',
      ...overrides,
    })
    .returning()) as [CapsuleRow];
  return row;
}

export async function createTestRecipient(
  db: Database,
  capsuleId: string,
  overrides: Partial<typeof capsuleRecipients.$inferInsert> = {},
): Promise<RecipientRow> {
  const [row] = (await db
    .insert(capsuleRecipients)
    .values({
      capsuleId,
      email: `recipient-${randomUUID()}@example.com`,
      accessTokenHash: randomUUID(),
      status: 'added',
      ...overrides,
    })
    .returning()) as [RecipientRow];
  return row;
}

export async function insertScheduledAction(
  db: Database,
  overrides: Partial<typeof scheduledActions.$inferInsert> & { subjectId: string; runAt: Date },
): Promise<ScheduledActionRow> {
  const [row] = (await db
    .insert(scheduledActions)
    .values({
      kind: 'capsule_unlock',
      ...overrides,
    })
    .returning()) as [ScheduledActionRow];
  return row;
}

/** Cleans up everything a scheduler test creates. Call in `afterAll`/`afterEach` with the ids collected during the test. */
export async function cleanupScheduler(db: Database, ids: { userIds?: string[]; scheduledActionIds?: string[] }): Promise<void> {
  if (ids.scheduledActionIds?.length) {
    await db.delete(scheduledActions).where(inArray(scheduledActions.id, ids.scheduledActionIds));
  }
  if (ids.userIds?.length) {
    await db.delete(users).where(inArray(users.id, ids.userIds)); // cascades capsules/recipients/media/versions
  }
}
