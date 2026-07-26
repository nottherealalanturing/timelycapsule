import { z } from 'zod';

/** Media upload pipeline, T-10 — plan/03-ARCHITECTURE.md §9 / §14 "media/tickets". */

export const MediaKindSchema = z.enum(['image', 'video', 'audio', 'voice', 'document', 'archive', 'link', 'location']);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const MediaStatusSchema = z.enum(['uploading', 'processing', 'ready', 'failed', 'infected']);
export type MediaStatus = z.infer<typeof MediaStatusSchema>;

export const CreateMediaTicketRequestSchema = z.object({
  name: z.string().min(1).max(255),
  mime: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  position: z.number().int().min(0).optional(),
});
export type CreateMediaTicketRequest = z.infer<typeof CreateMediaTicketRequestSchema>;

export const MediaPartSchema = z.object({
  partNumber: z.number().int().positive(),
  url: z.string(),
});
export type MediaPart = z.infer<typeof MediaPartSchema>;

export const CreateMediaTicketResponseSchema = z.object({
  mediaId: z.string().uuid(),
  uploadId: z.string(),
  parts: z.array(MediaPartSchema),
});
export type CreateMediaTicketResponse = z.infer<typeof CreateMediaTicketResponseSchema>;

export const CompletedMediaPartSchema = z.object({
  partNumber: z.number().int().positive(),
  eTag: z.string().min(1),
});
export type CompletedMediaPart = z.infer<typeof CompletedMediaPartSchema>;

export const CompleteMediaRequestSchema = z.object({
  parts: z.array(CompletedMediaPartSchema).min(1),
  // Client-computed content metadata (06 §A: thumbs/blurhash/EXIF-strip all happen pre-encryption on-device).
  encMeta: z.record(z.string(), z.unknown()).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  blurhash: z.string().optional(),
});
export type CompleteMediaRequest = z.infer<typeof CompleteMediaRequestSchema>;

export const PatchMediaRequestSchema = z.object({
  caption: z.string().max(2000).optional(),
  position: z.number().int().min(0).optional(),
});
export type PatchMediaRequest = z.infer<typeof PatchMediaRequestSchema>;

export const MediaItemSchema = z.object({
  id: z.string().uuid(),
  capsuleId: z.string().uuid(),
  kind: MediaKindSchema,
  originalName: z.string().nullable(),
  mime: z.string().nullable(),
  sizeBytes: z.number().nullable(),
  durationMs: z.number().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  caption: z.string().nullable(),
  position: z.number(),
  blurhash: z.string().nullable(),
  status: MediaStatusSchema,
  encMeta: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type MediaItem = z.infer<typeof MediaItemSchema>;

export const MediaResponseSchema = z.object({ media: MediaItemSchema });
export type MediaResponse = z.infer<typeof MediaResponseSchema>;

export const MediaViewResponseSchema = z.object({
  url: z.string(),
  expiresInSeconds: z.number(),
});
export type MediaViewResponse = z.infer<typeof MediaViewResponseSchema>;
