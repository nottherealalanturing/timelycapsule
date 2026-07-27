import { z } from 'zod';

/**
 * Capsule CRUD + state machine (T-08, plan/03-ARCHITECTURE.md §8 + §14).
 * Server never sees passphrases or unwrapped keys — only hints and wrapped
 * (still-encrypted) key blobs, transported here as base64 strings.
 */

export const CapsuleTypeSchema = z.enum([
  'self',
  'personal',
  'group',
  'birthday',
  'anniversary',
  'public',
  'legacy',
  'emergency',
  'campaign',
  'micro',
]);
export type CapsuleType = z.infer<typeof CapsuleTypeSchema>;

export const CapsuleStateSchema = z.enum(['draft', 'sealing', 'sealed', 'unlocked', 'expired', 'withdrawn']);
export type CapsuleState = z.infer<typeof CapsuleStateSchema>;

export const UnlockModeSchema = z.enum(['absolute', 'recipient_local', 'trustee', 'chained']);

// --- Seals (unlock conditions beyond Time, which is always implied by unlockAt) ---

export const PlaceSealConfigSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().positive(),
  name: z.string().min(1).max(200),
});

export const PassphraseSealConfigSchema = z.object({
  hint: z.string().min(1).max(200),
  /** The capsule key wrapped under Argon2id(passphrase) — produced client-side by @tc/crypto. Never the passphrase itself. */
  wrappedKeyB64: z.string().min(1),
});

export const IdentitySealConfigSchema = z.object({}).strict();

export const SealSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place'), config: PlaceSealConfigSchema }),
  z.object({ type: z.literal('passphrase'), config: PassphraseSealConfigSchema }),
  z.object({ type: z.literal('identity'), config: IdentitySealConfigSchema }),
]);
export type Seal = z.infer<typeof SealSchema>;

/** Max 3 beyond Time (03-ARCHITECTURE.md §8); one-of-each-type is enforced in modules/capsules/seals.ts, not here. */
export const SealsArraySchema = z.array(SealSchema).max(3);

export const CoverSchema = z.object({
  kind: z.enum(['gradient', 'image']),
  value: z.string(),
  theme: z.string().optional(),
});
export type Cover = z.infer<typeof CoverSchema>;

// --- Requests ---

export const CreateCapsuleRequestSchema = z.object({
  type: CapsuleTypeSchema,
});
export type CreateCapsuleRequest = z.infer<typeof CreateCapsuleRequestSchema>;

export const PatchCapsuleRequestSchema = z
  .object({
    title: z.string().max(200).nullable(),
    cover: CoverSchema.nullable(),
    teaser: z.string().max(280).nullable(),
    contentDocEnc: z.string().nullable(), // base64 ciphertext
    ownerKeyWrap: z.string().nullable(), // base64 wrapped capsule key
    unlockMode: UnlockModeSchema,
    unlockAt: z.string().datetime().nullable(),
    unlockLocal: z.object({ date: z.string(), time: z.string(), tz: z.string() }).nullable(),
    seals: SealsArraySchema,
    allowDownload: z.boolean(),
    recipientsVisible: z.boolean(),
    announceOnSeal: z.boolean(),
    requireRecipientVerification: z.boolean(),
    replyPrompt: z.string().max(500).nullable(),
    location: z.object({ lat: z.number(), lng: z.number(), name: z.string() }).nullable(),
    expiresAfter: z.string().nullable(), // Postgres interval literal, e.g. "24 hours"
    expiryStrict: z.boolean(),
    legacyConfig: z.record(z.string(), z.unknown()).nullable(),
    // Not in T-08's original contract — the DB column existed since T-02
    // but nothing exposed it until T-11's composer needed the "repeat
    // yearly" toggle. `{freq:"yearly", count|until}` per 03-ARCHITECTURE.md
    // §8; the scheduler actually acting on it is still T-13's job.
    recurrence: z.record(z.string(), z.unknown()).nullable(),
    // Same story as recurrence above — column existed since T-02, exposed
    // now because T-11's composer needs the "break-glass for self" toggle.
    // The actual early-open request flow (F3, 48h delay) is a later ticket.
    breakGlass: z.enum(['disabled', 'allowed']),
  })
  .partial();
export type PatchCapsuleRequest = z.infer<typeof PatchCapsuleRequestSchema>;

export const ExtendCapsuleRequestSchema = z.object({
  newUnlockAt: z.string().datetime(),
});
export type ExtendCapsuleRequest = z.infer<typeof ExtendCapsuleRequestSchema>;

export const ListCapsulesQuerySchema = z.object({
  state: CapsuleStateSchema.optional(),
  type: CapsuleTypeSchema.optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListCapsulesQuery = z.infer<typeof ListCapsulesQuerySchema>;

// --- Responses ---

/** Full detail — owner-only, includes ciphertext so the client can decrypt and continue editing. */
export const CapsuleSchema = z.object({
  id: z.string().uuid(),
  publicId: z.string(),
  type: CapsuleTypeSchema,
  state: CapsuleStateSchema,
  title: z.string().nullable(),
  cover: CoverSchema.nullable(),
  teaser: z.string().nullable(),
  contentDocEnc: z.string().nullable(),
  ownerKeyWrap: z.string().nullable(),
  passphraseHint: z.string().nullable(),
  sizeBytes: z.number(),
  unlockMode: UnlockModeSchema,
  unlockAt: z.string().nullable(),
  unlockLocal: z.object({ date: z.string(), time: z.string(), tz: z.string() }).nullable(),
  sealDeadlineAt: z.string().nullable(),
  sealedAt: z.string().nullable(),
  extendedOnce: z.boolean(),
  seals: SealsArraySchema,
  allowDownload: z.boolean(),
  recipientsVisible: z.boolean(),
  announceOnSeal: z.boolean(),
  requireRecipientVerification: z.boolean(),
  replyPrompt: z.string().nullable(),
  location: z.object({ lat: z.number(), lng: z.number(), name: z.string() }).nullable(),
  expiresAfter: z.string().nullable(),
  expiryStrict: z.boolean(),
  expiredAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  trashedAt: z.string().nullable(),
  purgeAfter: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  legacyConfig: z.record(z.string(), z.unknown()).nullable(),
  recurrence: z.record(z.string(), z.unknown()).nullable(),
  breakGlass: z.enum(['disabled', 'allowed']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Capsule = z.infer<typeof CapsuleSchema>;

/** Envelope only — no ciphertext — for list views (03-ARCHITECTURE.md §8: "needed for timelines, emails, OG images"). */
export const CapsuleListItemSchema = CapsuleSchema.omit({ contentDocEnc: true, ownerKeyWrap: true });
export type CapsuleListItem = z.infer<typeof CapsuleListItemSchema>;

export const CapsuleResponseSchema = z.object({ capsule: CapsuleSchema });
export type CapsuleResponse = z.infer<typeof CapsuleResponseSchema>;

export const CapsuleListResponseSchema = z.object({
  data: z.array(CapsuleListItemSchema),
  nextCursor: z.string().nullable(),
});
export type CapsuleListResponse = z.infer<typeof CapsuleListResponseSchema>;

export const ActivityEntrySchema = z.object({
  action: z.string(),
  actorType: z.enum(['user', 'recipient', 'admin', 'system']),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});
export const CapsuleActivityResponseSchema = z.object({
  data: z.array(ActivityEntrySchema),
});
export type CapsuleActivityResponse = z.infer<typeof CapsuleActivityResponseSchema>;
