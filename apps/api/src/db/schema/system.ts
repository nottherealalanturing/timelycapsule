import { bigserial, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { inet } from './custom-types';
import { actorTypeEnum, idempotencyStatusEnum } from './enums';
import { users } from './identity';

/**
 * Append-only. Spec (plan/03-ARCHITECTURE.md §13) calls for monthly range
 * partitioning at scale; deferred until volume warrants it — see
 * plan/PROGRESS.md decisions log. A single table is correct for a
 * pre-launch product and migrating to partitions later is a mechanical
 * change that doesn't touch the schema shape below.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    metadata: jsonb('metadata'),
    ip: inet('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_subject_idx').on(t.subjectType, t.subjectId),
    index('audit_events_actor_idx').on(t.actorType, t.actorId),
    index('audit_events_created_at_idx').on(t.createdAt),
  ],
);

/**
 * Table-backed `Idempotency-Key` support (plan/00-INDEX.md non-negotiable
 * rule #6, plan/03-ARCHITECTURE.md §14). Uniqueness on (key, method, path,
 * userId) — until auth lands in T-04, userId is always null here, which
 * means Postgres treats every anonymous row as distinct (NULLs are never
 * equal in a unique index) and uniqueness effectively doesn't apply to
 * unauthenticated requests yet. Acceptable: idempotency matters most for
 * authenticated side-effecting actions, which is exactly what T-04+ adds.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    method: text('method').notNull(),
    path: text('path').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    requestHash: text('request_hash').notNull(),
    status: idempotencyStatusEnum('status').notNull().default('in_progress'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('idempotency_keys_unique').on(t.key, t.method, t.path, t.userId),
  ],
);
