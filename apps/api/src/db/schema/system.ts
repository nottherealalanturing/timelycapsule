import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { inet } from './custom-types';
import { actorTypeEnum } from './enums';

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
