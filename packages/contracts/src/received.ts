import { z } from 'zod';
import { CoverSchema } from './capsules';

/**
 * Received inbox — T-16, plan/02-UX-DESIGN.md §5.8. The recipient-facing
 * view over `capsule_recipients` rows claimed by the authenticated user
 * (`userId` set via T-05's ghost-claim or T-15's save-to-account) — distinct
 * from `modules/recipients` (T-09), which is the sender's side of the same
 * table.
 */

export const ReceivedSectionSchema = z.enum(['upcoming', 'waiting', 'opened']);
export type ReceivedSection = z.infer<typeof ReceivedSectionSchema>;

export const ReceivedCapsuleSchema = z.object({
  recipientId: z.string().uuid(),
  capsuleId: z.string().uuid(),
  publicId: z.string(),
  section: ReceivedSectionSchema,
  senderName: z.string(),
  senderEmail: z.string().nullable(),
  title: z.string().nullable(),
  cover: CoverSchema.nullable(),
  teaser: z.string().nullable(),
  unlockAt: z.string().nullable(),
  /**
   * When the sender sealed it — the elapsed half of the Dual Clock.
   *
   * Its absence was the last place in the product where the waiting language
   * was incomplete. Received could state only what remained, so it drew half a
   * Dual Clock: a bare `formatDuration` in the clock's mono idiom with no
   * TRAVELLED beside it. `03 §V.1` wants both figures together, and elapsed is
   * the one that says *this has been kept for you for a while* — which is the
   * entire difference between a countdown and custody.
   *
   * Nullable because a capsule can be visible to a recipient without having
   * been sealed through the normal path.
   */
  sealedAt: z.string().nullable(),
  firstOpenedAt: z.string().nullable(),
});
export type ReceivedCapsule = z.infer<typeof ReceivedCapsuleSchema>;

export const ReceivedListResponseSchema = z.object({ data: z.array(ReceivedCapsuleSchema) });
export type ReceivedListResponse = z.infer<typeof ReceivedListResponseSchema>;
