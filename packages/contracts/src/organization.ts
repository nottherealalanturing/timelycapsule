import { z } from 'zod';
import { CoverSchema } from './capsules';

/** Tags, favorites, collections — T-17, plan/03-ARCHITECTURE.md §13 "ORGANIZATION OF CONTENT". */

// --- Tags ---

export const CreateTagRequestSchema = z.object({ name: z.string().min(1).max(60) });
export type CreateTagRequest = z.infer<typeof CreateTagRequestSchema>;

export const PatchTagRequestSchema = z.object({ name: z.string().min(1).max(60) });
export type PatchTagRequest = z.infer<typeof PatchTagRequestSchema>;

export const TagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TagResponseSchema = z.object({ tag: TagSchema });
export type TagResponse = z.infer<typeof TagResponseSchema>;

export const TagsListResponseSchema = z.object({ data: z.array(TagSchema) });
export type TagsListResponse = z.infer<typeof TagsListResponseSchema>;

export const PutCapsuleTagsRequestSchema = z.object({ tagIds: z.array(z.string().uuid()) });
export type PutCapsuleTagsRequest = z.infer<typeof PutCapsuleTagsRequestSchema>;

// --- Favorites ---

export const PutFavoriteRequestSchema = z.object({ value: z.boolean() });
export type PutFavoriteRequest = z.infer<typeof PutFavoriteRequestSchema>;

// --- Collections ---

export const CreateCollectionRequestSchema = z.object({
  name: z.string().min(1).max(120),
  cover: CoverSchema.optional(),
});
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

export const PatchCollectionRequestSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  cover: CoverSchema.optional(),
});
export type PatchCollectionRequest = z.infer<typeof PatchCollectionRequestSchema>;

export const CollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  cover: CoverSchema.nullable(),
  position: z.number(),
  capsuleCount: z.number(),
  createdAt: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionResponseSchema = z.object({ collection: CollectionSchema });
export type CollectionResponse = z.infer<typeof CollectionResponseSchema>;

export const CollectionsListResponseSchema = z.object({ data: z.array(CollectionSchema) });
export type CollectionsListResponse = z.infer<typeof CollectionsListResponseSchema>;

export const AddCollectionItemRequestSchema = z.object({ capsuleId: z.string().uuid() });
export type AddCollectionItemRequest = z.infer<typeof AddCollectionItemRequestSchema>;

/** Full reorder — replaces the collection's capsule order with this exact list. */
export const ReorderCollectionItemsRequestSchema = z.object({ capsuleIds: z.array(z.string().uuid()) });
export type ReorderCollectionItemsRequest = z.infer<typeof ReorderCollectionItemsRequestSchema>;
