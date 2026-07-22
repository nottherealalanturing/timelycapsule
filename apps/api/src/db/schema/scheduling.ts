import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actionKindEnum, actionStateEnum } from './enums';

/**
 * SOURCE OF TRUTH for all future work (plan/03-ARCHITECTURE.md §10).
 * Queues (pg-boss, per plan/04-ZERO-COST-PLAN.md) are execution vehicles
 * only — this table is what survives a queue/Redis loss.
 */
export const scheduledActions = pgTable(
  'scheduled_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: actionKindEnum('kind').notNull(),
    subjectId: uuid('subject_id').notNull(), // capsule/recipient/user id, per kind
    runAt: timestamp('run_at', { withTimezone: true }).notNull(),
    state: actionStateEnum('state').notNull().default('pending'),
    attempts: integer('attempts').default(0),
    lastError: text('last_error'),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scheduled_actions_idempotency_key_unique').on(t.idempotencyKey),
    // THE index — the promoter's hot query filters state='pending' ordered by run_at.
    index('scheduled_actions_state_run_at_idx')
      .on(t.state, t.runAt)
      .where(sql`${t.state} = 'pending'`),
  ],
);
