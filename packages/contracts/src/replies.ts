import { z } from 'zod';

/**
 * Replies — the correspondence a capsule opens into.
 *
 * The wire carries **ciphertext only**. `bodyEnc` is `iv||ciphertext` base64'd
 * once, the same format `capsules.contentDocEnc` and every enclosure use, and
 * it is encrypted with the capsule key that both parties already hold. There
 * is deliberately no plaintext field anywhere in this contract: the previous
 * implementation had one (`ReactRequest.note`) and that is precisely how the
 * contents of every reply ended up readable on the server, in email, and in
 * notification rows.
 */

export const ReplyAuthorSchema = z.enum(['sender', 'recipient']);
export type ReplyAuthor = z.infer<typeof ReplyAuthorSchema>;

export const ReplySchema = z.object({
  id: z.string().uuid(),
  author: ReplyAuthorSchema,
  /** iv||ciphertext, base64. Opened with the capsule key, on the device. */
  bodyEnc: z.string(),
  createdAt: z.string(),
});
export type Reply = z.infer<typeof ReplySchema>;

/**
 * 8 KiB of base64 ≈ 6 KiB of text, which is a long letter and nowhere near a
 * file upload. Bounded because an unbounded text column reachable with only a
 * link is an invitation.
 */
export const WriteReplyRequestSchema = z.object({
  bodyEnc: z.string().min(1).max(8192),
});
export type WriteReplyRequest = z.infer<typeof WriteReplyRequestSchema>;

/** The sender's side additionally names which correspondence they are answering. */
export const SenderWriteReplyRequestSchema = WriteReplyRequestSchema.extend({
  recipientId: z.string().uuid(),
});
export type SenderWriteReplyRequest = z.infer<typeof SenderWriteReplyRequestSchema>;

export const ReplyListResponseSchema = z.object({ data: z.array(ReplySchema) });
export type ReplyListResponse = z.infer<typeof ReplyListResponseSchema>;

/**
 * The sender reads every thread at once, so each is labelled by who it is
 * with. `recipientLabel` is a display name or address the sender themselves
 * entered — never anything the recipient supplied.
 */
export const ReplyThreadSchema = z.object({
  recipientId: z.string().uuid(),
  recipientLabel: z.string().nullable(),
  replies: z.array(ReplySchema),
});
export type ReplyThread = z.infer<typeof ReplyThreadSchema>;

export const ReplyThreadListResponseSchema = z.object({ data: z.array(ReplyThreadSchema) });
export type ReplyThreadListResponse = z.infer<typeof ReplyThreadListResponseSchema>;
