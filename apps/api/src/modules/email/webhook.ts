import { and, eq, gt, ne } from 'drizzle-orm';
import { Router, type Request } from 'express';
import { Webhook, WebhookVerificationError } from 'svix';
import type { Database } from '../../db/client.js';
import { capsuleRecipients, capsules, users } from '../../db/schema/index.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../logger.js';
import { writeNotification } from '../notifications/index.js';
import { countBouncesForAddress, markStateByProviderId } from './ledger.js';
import { sendBounceAlert } from './service.js';

interface ResendWebhookEvent {
  type: string;
  data: { email_id?: string; to?: string[] };
}

const HARD_BOUNCE_THRESHOLD = 2;

/**
 * "2 hard bounces → address flagged, sender prompted" (03-ARCHITECTURE.md
 * §11). A bounced address can be a recipient on more than one live capsule
 * (a typo'd email reused across several), so this escalates once per
 * still-relevant capsule, not just once per address.
 */
async function escalateBouncedAddress(db: Database, email: string): Promise<void> {
  const bounceCount = await countBouncesForAddress(db, email);
  if (bounceCount < HARD_BOUNCE_THRESHOLD) return;

  const affected = await db
    .select({
      recipientId: capsuleRecipients.id,
      capsuleId: capsules.id,
      capsuleTitle: capsules.title,
      unlockAt: capsules.unlockAt,
      ownerId: capsules.ownerId,
    })
    .from(capsuleRecipients)
    .innerJoin(capsules, eq(capsules.id, capsuleRecipients.capsuleId))
    .where(
      and(
        eq(capsuleRecipients.email, email),
        ne(capsuleRecipients.status, 'opened'),
        ne(capsuleRecipients.status, 'blocked_suppressed'),
        ne(capsuleRecipients.status, 'bounced'), // already escalated
        gt(capsules.unlockAt, new Date()),
      ),
    );

  for (const row of affected) {
    if (!row.ownerId) continue; // guest capsules have no email recipient to match this loop against anyway
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, row.ownerId)).limit(1);
    if (!owner) continue;

    await db.update(capsuleRecipients).set({ status: 'bounced' }).where(eq(capsuleRecipients.id, row.recipientId));

    const daysUntilUnlock = row.unlockAt ? Math.max(0, Math.round((row.unlockAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;
    await writeNotification(db, {
      userId: row.ownerId,
      category: 'delivery',
      title: 'We couldn’t reach a recipient',
      body: `Emails to ${email} keep bouncing.`,
      data: { capsuleId: row.capsuleId, recipientId: row.recipientId },
    });
    await sendBounceAlert(db, owner.email, {
      recipientEmail: email,
      capsuleTitle: row.capsuleTitle,
      daysUntilUnlock,
      manageUrl: `${process.env.APP_URL ?? 'http://localhost:3001'}/capsule/${row.capsuleId}`,
    });
  }
}

/** Resend signs webhooks via Svix — see app.ts for the raw-body capture this needs. */
export function emailWebhookRouter(db: Database): Router {
  const router = Router();

  router.post('/webhooks/resend', async (req, res, next) => {
    try {
      const secret = process.env.RESEND_WEBHOOK_SECRET;
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!secret || !rawBody) {
        throw ApiError.unauthorized('Webhook not configured');
      }

      let event: ResendWebhookEvent;
      try {
        event = new Webhook(secret).verify(rawBody, req.headers as Record<string, string>) as ResendWebhookEvent;
      } catch (err) {
        if (err instanceof WebhookVerificationError) {
          throw ApiError.unauthorized('Invalid webhook signature');
        }
        throw err;
      }

      const emailId = event.data.email_id;
      if (emailId) {
        if (event.type === 'email.delivered') {
          await markStateByProviderId(db, emailId, 'delivered');
        } else if (event.type === 'email.bounced' || event.type === 'email.complained') {
          await markStateByProviderId(db, emailId, 'bounced');
          const toRef = event.data.to?.[0];
          if (toRef) {
            await escalateBouncedAddress(db, toRef);
          }
        }
      }

      logger.info({ event: 'resend_webhook', type: event.type, emailId }, 'Resend webhook processed');
      res.status(200).json({ received: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
