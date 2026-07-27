import { z } from 'zod';
import { CoverSchema } from './capsules';

/**
 * Recipient (token-auth, no account) reveal experience — T-15,
 * plan/03-ARCHITECTURE.md §14 "RECIPIENT". `/r/:token` is the API path;
 * the web page lives at `/c/:token#k=...` (reserved since T-06).
 */

export const RevealStatusSchema = z.enum(['locked', 'unlocked', 'withdrawn', 'expired']);
export type RevealStatus = z.infer<typeof RevealStatusSchema>;

/** Public (non-secret) view of a seal on the locked page — never includes the passphrase itself, only its already-wrapped key blob. */
export const SealStatusSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place'), satisfied: z.boolean(), name: z.string(), radiusM: z.number() }),
  z.object({ type: z.literal('passphrase'), satisfied: z.boolean(), hint: z.string(), wrappedKeyB64: z.string() }),
  z.object({ type: z.literal('identity'), satisfied: z.boolean() }),
]);
export type SealStatus = z.infer<typeof SealStatusSchema>;

export const RevealLockedResponseSchema = z.object({
  status: z.literal('locked'),
  publicId: z.string(),
  senderName: z.string(),
  cover: CoverSchema.nullable(),
  teaser: z.string().nullable(),
  unlockAt: z.string().nullable(),
  unlockLocal: z.object({ date: z.string(), time: z.string(), tz: z.string() }).nullable(),
  seals: z.array(SealStatusSchema),
  recipientDisplayName: z.string().nullable(),
});
export type RevealLockedResponse = z.infer<typeof RevealLockedResponseSchema>;

const RevealMediaSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['image', 'video', 'audio', 'voice', 'document', 'archive', 'link', 'location']),
  caption: z.string().nullable(),
  position: z.number(),
  encMeta: z.record(z.string(), z.unknown()).nullable(),
  viewUrl: z.string(),
  mime: z.string().nullable(),
  originalName: z.string().nullable(),
});
export type RevealMedia = z.infer<typeof RevealMediaSchema>;

export const RevealUnlockedResponseSchema = z.object({
  status: z.literal('unlocked'),
  publicId: z.string(),
  senderName: z.string(),
  cover: CoverSchema.nullable(),
  contentDocEnc: z.string().nullable(), // base64 iv‖ciphertext — client decrypts with the fragment/passphrase-derived key
  media: z.array(RevealMediaSchema),
  location: z.object({ lat: z.number(), lng: z.number(), name: z.string() }).nullable(),
  replyPrompt: z.string().nullable(),
  passphraseSeal: z.object({ hint: z.string(), wrappedKeyB64: z.string() }).nullable(),
  allowDownload: z.boolean(),
  recipientsVisible: z.boolean(),
  requireIdentityVerification: z.boolean(),
  identityVerified: z.boolean(),
  alreadyOpened: z.boolean(), // true on return visits — skip the ceremony replay
});
export type RevealUnlockedResponse = z.infer<typeof RevealUnlockedResponseSchema>;

export const RevealWithdrawnResponseSchema = z.object({ status: z.literal('withdrawn') });
export const RevealExpiredResponseSchema = z.object({ status: z.literal('expired') });

export const RevealResponseSchema = z.discriminatedUnion('status', [
  RevealLockedResponseSchema,
  RevealUnlockedResponseSchema,
  RevealWithdrawnResponseSchema,
  RevealExpiredResponseSchema,
]);
export type RevealResponse = z.infer<typeof RevealResponseSchema>;

// --- Actions ---

export const VerifyIdentityRequestSchema = z.object({ code: z.string().length(6) });
export type VerifyIdentityRequest = z.infer<typeof VerifyIdentityRequestSchema>;

export const VerifyIdentityResponseSchema = z.object({ gateToken: z.string() });
export type VerifyIdentityResponse = z.infer<typeof VerifyIdentityResponseSchema>;

export const RequestIdentityCodeResponseSchema = z.object({ sent: z.boolean() });

export const PlaceCheckRequestSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export type PlaceCheckRequest = z.infer<typeof PlaceCheckRequestSchema>;

export const PlaceCheckResponseSchema = z.object({
  withinRange: z.boolean(),
  distanceM: z.number(),
  bearingDeg: z.number(),
  gateToken: z.string().nullable(), // present only when withinRange
});
export type PlaceCheckResponse = z.infer<typeof PlaceCheckResponseSchema>;

export const RemindRequestSchema = z.object({ enabled: z.boolean() });
export type RemindRequest = z.infer<typeof RemindRequestSchema>;

export const ReactRequestSchema = z.object({
  emoji: z.string().min(1).max(8),
  note: z.string().max(500).optional(),
});
export type ReactRequest = z.infer<typeof ReactRequestSchema>;

export const ReportRequestSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'other']),
  details: z.string().max(1000).optional(),
});
export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export const TzInferRequestSchema = z.object({ tz: z.string().min(1).max(100) });
export type TzInferRequest = z.infer<typeof TzInferRequestSchema>;
