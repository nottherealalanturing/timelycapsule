import { z } from 'zod';
import { CapsuleTypeSchema } from './capsules';

/** Settings v1 (T-18, plan/02-UX-DESIGN.md §5.13) — Storage/Data/avatar-upload schemas not already owned by another module's contracts file. */

// --- Storage tab ---

export const LargestCapsuleSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string(),
  title: z.string().nullable(),
  // Lets the client fall back to `capsuleName()`'s "For yourself"/"For
  // someone else" reading instead of a bare "Untitled capsule" placeholder
  // (CapsuleRow's `capsuleName()` doc comment explains why that placeholder
  // was removed everywhere else).
  type: CapsuleTypeSchema,
  sizeBytes: z.number(),
});
export type LargestCapsule = z.infer<typeof LargestCapsuleSchema>;

export const StorageResponseSchema = z.object({
  usedBytes: z.number(),
  quotaBytes: z.number().nullable(), // null = unlimited plan
  largest: z.array(LargestCapsuleSchema),
  /** M4 — bytes reclaimed from capsules whose storage term has ended. Stated as a fact of the account's history, not subtracted silently. */
  releasedBytes: z.number(),
  /** How many capsules hold at least one released enclosure. */
  releasedCapsuleCount: z.number(),
  /** The next capsule due to have its enclosures released, if any. Null when nothing is scheduled. */
  nextRelease: z
    .object({
      capsuleId: z.string().uuid(),
      title: z.string().nullable(),
      type: CapsuleTypeSchema,
      releaseAt: z.string(),
    })
    .nullable(),
});
export type StorageResponse = z.infer<typeof StorageResponseSchema>;

// --- Avatar upload ---

export const AvatarUploadRequestSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
export type AvatarUploadRequest = z.infer<typeof AvatarUploadRequestSchema>;

export const AvatarUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  avatarKey: z.string(),
});
export type AvatarUploadResponse = z.infer<typeof AvatarUploadResponseSchema>;

// --- Data export (F-none, ticket text: "async zip job → email link") ---

export const ExportResponseSchema = z.object({
  /** The backing `scheduled_actions` row id — export state is tracked there like every other future/background action, not a bespoke table. */
  jobId: z.string().uuid(),
});
export type ExportResponse = z.infer<typeof ExportResponseSchema>;

// --- Account deletion (F8, 02-UX-DESIGN.md §7) ---

/** A sealed capsule with real (non-suppressed) recipients — the owner must choose its fate before deleting. Already-unlocked capsules with recipients are auto-preserved (anonymized) without asking; capsules with no real recipients are simply deleted with the account. */
export const DeletionPreviewItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  type: CapsuleTypeSchema,
  cover: z
    .object({ kind: z.enum(['gradient', 'image']), value: z.string(), theme: z.string().optional() })
    .nullable(),
  recipientCount: z.number(),
});
export type DeletionPreviewItem = z.infer<typeof DeletionPreviewItemSchema>;

export const DeletionPreviewResponseSchema = z.object({
  needsDecision: z.array(DeletionPreviewItemSchema),
});
export type DeletionPreviewResponse = z.infer<typeof DeletionPreviewResponseSchema>;

export const CapsuleDeletionDecisionSchema = z.object({
  capsuleId: z.string().uuid(),
  action: z.enum(['deliver', 'withdraw']),
});
export type CapsuleDeletionDecision = z.infer<typeof CapsuleDeletionDecisionSchema>;

export const DeleteAccountRequestSchema = z.object({
  password: z.string().min(1),
  capsuleDecisions: z.array(CapsuleDeletionDecisionSchema),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;
