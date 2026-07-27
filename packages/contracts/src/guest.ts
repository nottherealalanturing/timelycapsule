import { z } from 'zod';
import { CoverSchema } from './capsules';

/**
 * Guest mode (T-15b, 01-PRODUCT.md §4.1b / 03-ARCHITECTURE.md §14 GUEST) —
 * anonymous, no-signup capsule creation. One capsule (draft or sealed) per
 * guest session, text-only, unlock ≤ +1 year. Delivery is link-only: the
 * capsule reveal itself reuses T-15's `/r/:token` recipient pipeline via a
 * single anonymous `capsule_recipients` row created alongside the capsule.
 */

export const GuestSessionResponseSchema = z.object({ guestToken: z.string() });
export type GuestSessionResponse = z.infer<typeof GuestSessionResponseSchema>;

export const CreateGuestCapsuleRequestSchema = z.object({
  title: z.string().max(120).optional(),
  cover: CoverSchema.optional(),
});
export type CreateGuestCapsuleRequest = z.infer<typeof CreateGuestCapsuleRequestSchema>;

export const PatchGuestCapsuleRequestSchema = z.object({
  title: z.string().max(120).nullable().optional(),
  cover: CoverSchema.nullable().optional(),
  teaser: z.string().max(280).nullable().optional(),
  /** base64 iv‖ciphertext — server never sees plaintext; byte length is capped as a proxy for the ≤5,000-char limit. */
  contentDocEnc: z.string().max(32_000).nullable().optional(),
  unlockAt: z.string().nullable().optional(),
});
export type PatchGuestCapsuleRequest = z.infer<typeof PatchGuestCapsuleRequestSchema>;

export const GuestCapsuleResponseSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string(),
  state: z.enum(['draft', 'sealed', 'unlocked', 'expired', 'withdrawn']),
  title: z.string().nullable(),
  cover: CoverSchema.nullable(),
  unlockAt: z.string().nullable(),
  sealedAt: z.string().nullable(),
  /** Present only in the `POST /guest/capsules` response — the raw recipient access token, returned once (T-09 one-time-reveal pattern). Combine with the client-held capsule key to build `/c/:token#k=...`. */
  recipientToken: z.string().optional(),
});
export type GuestCapsuleResponse = z.infer<typeof GuestCapsuleResponseSchema>;
