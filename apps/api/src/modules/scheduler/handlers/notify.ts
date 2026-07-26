import type { Database } from '../../../db/client.js';
import { audit } from '../../../db/audit.js';

/**
 * Stub per T-13 ticket text scope — this scheduler ticket owns firing the
 * handler at the right time; the actual email templates and send plumbing
 * are T-14's job ("unlock emails fire from T-13 handler" is listed as
 * *T-14's* DoD line, i.e. T-14 wires a real implementation behind this
 * call). Mirrors the `resendInvite` stub precedent from T-09. Recipient
 * access tokens are architecturally non-recoverable after creation
 * (T-09 design), so no handler here can construct a real reveal link
 * anyway — that constraint is T-14/T-15's to solve.
 */
export async function stubNotify(
  db: Database,
  input: { action: string; subjectType: string; subjectId: string; metadata?: unknown },
): Promise<void> {
  await audit(db, {
    actorType: 'system',
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    metadata: input.metadata,
  });
}
