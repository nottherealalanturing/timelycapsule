import { z } from 'zod';

/** Recipients (sender side), T-09 — plan/03-ARCHITECTURE.md §14 "RECIPIENTS". */

export const RecipientStatusSchema = z.enum([
  'added',
  'invited',
  'notified',
  'viewed_locked',
  'opened',
  'bounced',
  'blocked_suppressed',
]);
export type RecipientStatus = z.infer<typeof RecipientStatusSchema>;

export const CreateRecipientRequestSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(1).optional(),
    displayName: z.string().max(120).optional(),
    isFallback: z.boolean().optional(),
    fallbackAfter: z.string().optional(), // Postgres interval literal, e.g. "30 days"
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'Either email or phone is required',
    path: ['email'],
  });
export type CreateRecipientRequest = z.infer<typeof CreateRecipientRequestSchema>;

export const PatchRecipientRequestSchema = z.object({
  email: z.string().email(),
});
export type PatchRecipientRequest = z.infer<typeof PatchRecipientRequestSchema>;

export const RecipientSchema = z.object({
  id: z.string().uuid(),
  capsuleId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  displayName: z.string().nullable(),
  status: RecipientStatusSchema,
  firstOpenedAt: z.string().nullable(),
  lastViewedAt: z.string().nullable(),
  resolvedUnlockAt: z.string().nullable(),
  verificationRequired: z.boolean().nullable(),
  verifiedAt: z.string().nullable(),
  isFallback: z.boolean().nullable(),
  fallbackAfter: z.string().nullable(),
  createdAt: z.string(),
});
export type Recipient = z.infer<typeof RecipientSchema>;

export const RecipientResponseSchema = z.object({ recipient: RecipientSchema });
export type RecipientResponse = z.infer<typeof RecipientResponseSchema>;

/** Only returned once, at creation — the raw token needed to build the recipient's `/r/:token` link. Never stored server-side, only its hash. */
export const CreateRecipientResponseSchema = z.object({
  recipient: RecipientSchema,
  accessToken: z.string(),
});
export type CreateRecipientResponse = z.infer<typeof CreateRecipientResponseSchema>;

export const RecipientsListResponseSchema = z.object({
  data: z.array(RecipientSchema),
});
export type RecipientsListResponse = z.infer<typeof RecipientsListResponseSchema>;

// --- Blocks (recipient-side abuse mitigation, checked when a sender adds a recipient) ---

export const CreateBlockRequestSchema = z.object({
  email: z.string().email(),
});
export type CreateBlockRequest = z.infer<typeof CreateBlockRequestSchema>;

export const BlockSchema = z.object({
  blockedEmail: z.string(),
  createdAt: z.string(),
});
export type Block = z.infer<typeof BlockSchema>;

export const BlocksListResponseSchema = z.object({
  data: z.array(BlockSchema),
});
export type BlocksListResponse = z.infer<typeof BlocksListResponseSchema>;
