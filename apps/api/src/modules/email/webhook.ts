import { Router, type Request } from 'express';
import { Webhook, WebhookVerificationError } from 'svix';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { logger } from '../../logger.js';
import { markStateByProviderId } from './ledger.js';

interface ResendWebhookEvent {
  type: string;
  data: { email_id?: string };
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
