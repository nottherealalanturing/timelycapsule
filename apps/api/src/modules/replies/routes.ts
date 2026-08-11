import { SenderWriteReplyRequestSchema, WriteReplyRequestSchema } from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth } from '../auth/index.js';
import { requireGuestSession } from '../guest/index.js';
import { validate } from '../../middleware/validate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { capsules } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';
import {
  listRepliesForRecipient,
  listThreadsForCapsule,
  writeRecipientReply,
  writeSenderReply,
} from './service.js';

const TokenParamsSchema = z.object({ token: z.string().min(10) });
const IdParamSchema = z.object({ id: z.string().uuid() });

/**
 * Two doors into one conversation.
 *
 * The recipient's door is the access token in their link — they have no
 * account and `07` guarantees the reveal works without one, so requiring a
 * sign-in to write back would put an account between someone and answering
 * their mother's letter. The sender's door is their session.
 *
 * Both carry ciphertext and nothing else.
 */
export function repliesRouter(db: Database): Router {
  const router = Router();

  router.get('/r/:token/replies', validate({ params: TokenParamsSchema }), async (req, res, next) => {
    try {
      const data = await listRepliesForRecipient(db, req.params.token as string);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/r/:token/replies',
    // A link is a weaker credential than a session, so the door it opens is
    // narrower. Generous enough for a real correspondence, closed to a script.
    rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }),
    validate({ params: TokenParamsSchema, body: WriteReplyRequestSchema }),
    async (req, res, next) => {
      try {
        const reply = await writeRecipientReply(db, req.params.token as string, req.body.bodyEnc);
        res.status(201).json({ reply });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

/**
 * The guest sender's side.
 *
 * A guest-sealed capsule has no `ownerId`, so the authenticated route below
 * can never serve it — and without this a guest would be the one party in the
 * product who cannot read replies to their own capsule, having been perfectly
 * able to send it. Their credential is the guest session token, which is the
 * same credential that wrote the capsule in the first place.
 *
 * Read-only on purpose: a guest has no master key and no account, so there is
 * no durable place for them to hold a conversation from. Writing back is
 * something claiming the capsule into an account gives them.
 */
export function guestRepliesRouter(db: Database): Router {
  const router = Router();

  router.get(
    '/guest/capsules/:id/replies',
    requireGuestSession(db),
    validate({ params: IdParamSchema }),
    async (req, res, next) => {
      try {
        const capsuleId = req.params.id as string;
        const [capsule] = await db
          .select({ guestSessionId: capsules.guestSessionId })
          .from(capsules)
          .where(eq(capsules.id, capsuleId))
          .limit(1);
        if (!capsule || capsule.guestSessionId !== req.guestSession!.id) {
          throw ApiError.notFound('Capsule not found');
        }
        const data = await listThreadsForCapsule(db, capsuleId);
        res.status(200).json({ data });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

/** The sender's side, mounted under the authenticated capsule routes. */
export function senderRepliesRouter(db: Database): Router {
  const router = Router();
  router.use('/capsules', requireAuth());

  // Ownership is checked here rather than trusted from the path: a capsule id
  // is a uuid someone else could hold, and replies are the most private thing
  // on the capsule.
  async function assertOwner(capsuleId: string, userId: string): Promise<void> {
    const [capsule] = await db.select({ ownerId: capsules.ownerId }).from(capsules).where(eq(capsules.id, capsuleId)).limit(1);
    if (!capsule || capsule.ownerId !== userId) throw ApiError.notFound('Capsule not found');
  }

  router.get('/capsules/:id/replies', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      await assertOwner(req.params.id as string, req.user!.id);
      const data = await listThreadsForCapsule(db, req.params.id as string);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/capsules/:id/replies',
    validate({ params: IdParamSchema, body: SenderWriteReplyRequestSchema }),
    async (req, res, next) => {
      try {
        await assertOwner(req.params.id as string, req.user!.id);
        const reply = await writeSenderReply(db, req.params.id as string, req.body.recipientId, req.body.bodyEnc);
        res.status(201).json({ reply });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
