import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { outboundMessages } from '../../db/schema/index.js';

type OutboundMessage = typeof outboundMessages.$inferSelect;

export async function recordQueued(
  db: Database,
  input: { toRef: string; template: string; payload?: unknown },
): Promise<OutboundMessage> {
  const [row] = (await db
    .insert(outboundMessages)
    .values({
      channel: 'email',
      toRef: input.toRef,
      template: input.template,
      payload: input.payload,
      state: 'queued',
    })
    .returning()) as [OutboundMessage];
  return row;
}

export async function markSent(db: Database, id: string, providerId: string | null): Promise<void> {
  await db
    .update(outboundMessages)
    .set({ state: 'sent', providerId: providerId ?? undefined })
    .where(eq(outboundMessages.id, id));
}

export async function markFailed(db: Database, id: string, attempts: number): Promise<void> {
  await db.update(outboundMessages).set({ state: 'failed', attempts }).where(eq(outboundMessages.id, id));
}

/** Used by the Resend webhook, which only knows the provider's message id. */
export async function markStateByProviderId(
  db: Database,
  providerId: string,
  state: 'delivered' | 'bounced' | 'failed',
): Promise<void> {
  await db.update(outboundMessages).set({ state }).where(eq(outboundMessages.providerId, providerId));
}
