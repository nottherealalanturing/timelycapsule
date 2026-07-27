import type { Database } from './client.js';
import { auditEvents } from './schema/index.js';

export interface AuditEventInput {
  actorType: 'user' | 'recipient' | 'admin' | 'system' | 'guest';
  actorId?: string;
  action: string;
  subjectType: string;
  subjectId: string;
  metadata?: unknown;
  ip?: string;
}

/**
 * Every capsule/account state transition writes one of these
 * (plan/03-ARCHITECTURE.md §8 invariant #7). Callers pass an existing
 * transaction's `db` handle when writing inside a transaction so the
 * audit row commits/rolls back atomically with the state change.
 */
export async function audit(db: Database, event: AuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorType: event.actorType,
    actorId: event.actorId,
    action: event.action,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    metadata: event.metadata,
    ip: event.ip,
  });
}
