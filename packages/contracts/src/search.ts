import { z } from 'zod';
import { CoverSchema } from './capsules';

/**
 * `GET /search` — T-17, plan/02-UX-DESIGN.md §5.11 / 03-ARCHITECTURE.md
 * "no server content search (client-side index of opened content; server
 * FTS = titles/tags only)". Every branch below is deliberately built from
 * plaintext-envelope columns only (capsule title, tag name, recipient
 * display name/email) — never `content_doc_enc` or any other ciphertext,
 * so this schema itself is the guarantee that no decrypted content can
 * ever flow through a search response.
 */
export const SearchResultItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('capsule'),
    id: z.string().uuid(),
    title: z.string().nullable(),
    cover: CoverSchema.nullable(),
    state: z.string(),
    matchedOn: z.enum(['title', 'tag', 'recipient']),
  }),
  z.object({
    kind: z.literal('person'),
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('collection'),
    id: z.string().uuid(),
    name: z.string(),
  }),
]);
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseSchema = z.object({ data: z.array(SearchResultItemSchema) });
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
