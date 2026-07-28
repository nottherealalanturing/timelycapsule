import {
  CreateContactGroupRequestSchema,
  CreateContactRequestSchema,
  PatchContactGroupRequestSchema,
  PatchContactRequestSchema,
  SetContactGroupMemberRequestSchema,
} from '@tc/contracts';
import { Router } from 'express';
import { z } from 'zod';
import type { Database } from '../../db/client.js';
import { idempotency } from '../../middleware/idempotency.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import {
  addContactToGroup,
  createContact,
  createContactGroup,
  deleteContact,
  deleteContactGroup,
  listContactGroups,
  listContacts,
  patchContact,
  patchContactGroup,
  removeContactFromGroup,
} from './service.js';

const IdParamSchema = z.object({ id: z.string().uuid() });
const GroupMemberParamsSchema = z.object({ id: z.string().uuid(), contactId: z.string().uuid() });

export function contactsRouter(db: Database): Router {
  const router = Router();
  router.use('/contacts', requireAuth());
  router.use('/contact-groups', requireAuth());

  router.get('/contacts', async (req, res, next) => {
    try {
      const data = await listContacts(db, req.user!.id);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/contacts', idempotency(db), validate({ body: CreateContactRequestSchema }), async (req, res, next) => {
    try {
      const contact = await createContact(db, req.user!.id, req.body);
      res.status(201).json({ contact });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/contacts/:id', validate({ params: IdParamSchema, body: PatchContactRequestSchema }), async (req, res, next) => {
    try {
      const contact = await patchContact(db, req.user!.id, req.params.id as string, req.body);
      res.status(200).json({ contact });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/contacts/:id', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      await deleteContact(db, req.user!.id, req.params.id as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.get('/contact-groups', async (req, res, next) => {
    try {
      const data = await listContactGroups(db, req.user!.id);
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/contact-groups', idempotency(db), validate({ body: CreateContactGroupRequestSchema }), async (req, res, next) => {
    try {
      const group = await createContactGroup(db, req.user!.id, req.body);
      res.status(201).json({ group });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/contact-groups/:id',
    validate({ params: IdParamSchema, body: PatchContactGroupRequestSchema }),
    async (req, res, next) => {
      try {
        const group = await patchContactGroup(db, req.user!.id, req.params.id as string, req.body);
        res.status(200).json({ group });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/contact-groups/:id', validate({ params: IdParamSchema }), async (req, res, next) => {
    try {
      await deleteContactGroup(db, req.user!.id, req.params.id as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/contact-groups/:id/members',
    validate({ params: IdParamSchema, body: SetContactGroupMemberRequestSchema }),
    async (req, res, next) => {
      try {
        await addContactToGroup(db, req.user!.id, req.params.id as string, req.body.contactId);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete('/contact-groups/:id/members/:contactId', validate({ params: GroupMemberParamsSchema }), async (req, res, next) => {
    try {
      await removeContactFromGroup(db, req.user!.id, req.params.id as string, req.params.contactId as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
