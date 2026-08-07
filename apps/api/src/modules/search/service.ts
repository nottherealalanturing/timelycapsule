import type { SearchResultItem } from '@tc/contracts';
import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { capsuleRecipients, capsuleTags, capsules, collections, contacts, tags } from '../../db/schema/index.js';

const CAPSULE_LIMIT = 8;
const PERSON_LIMIT = 5;
const COLLECTION_LIMIT = 5;

type CapsuleRow = typeof capsules.$inferSelect;

function capsuleResult(row: CapsuleRow, matchedOn: 'title' | 'tag' | 'recipient'): SearchResultItem {
  return {
    kind: 'capsule',
    id: row.id,
    publicId: row.publicId,
    type: row.type,
    title: row.title,
    state: row.state,
    matchedOn,
  };
}

/**
 * Server-side search — plan/03-ARCHITECTURE.md: "no server content search
 * (client-side index of opened content; server FTS = titles/tags only)".
 * Every branch below reads only plaintext-envelope columns (capsule title,
 * tag name, recipient display name/email) — `content_doc_enc` is never
 * touched, by construction, not by a filter that could be forgotten.
 * Trashed capsules are excluded (deleted, shouldn't resurface); archived
 * ones still match, same as any other organizational view.
 */
export async function search(db: Database, ownerId: string, q: string): Promise<SearchResultItem[]> {
  const like = `%${q}%`;
  const results: SearchResultItem[] = [];
  const seenCapsuleIds = new Set<string>();
  const capsuleResultCount = () => results.filter((r) => r.kind === 'capsule').length;

  const titleRows = await db
    .select()
    .from(capsules)
    .where(and(eq(capsules.ownerId, ownerId), isNull(capsules.trashedAt), ilike(capsules.title, like)))
    .limit(CAPSULE_LIMIT);
  for (const row of titleRows) {
    seenCapsuleIds.add(row.id);
    results.push(capsuleResult(row, 'title'));
  }

  if (capsuleResultCount() < CAPSULE_LIMIT) {
    const tagRows = await db
      .select({ capsule: capsules })
      .from(capsuleTags)
      .innerJoin(tags, eq(tags.id, capsuleTags.tagId))
      .innerJoin(capsules, eq(capsules.id, capsuleTags.capsuleId))
      .where(and(eq(tags.userId, ownerId), eq(capsules.ownerId, ownerId), isNull(capsules.trashedAt), ilike(tags.name, like)))
      .limit(CAPSULE_LIMIT);
    for (const { capsule } of tagRows) {
      if (seenCapsuleIds.has(capsule.id) || capsuleResultCount() >= CAPSULE_LIMIT) continue;
      seenCapsuleIds.add(capsule.id);
      results.push(capsuleResult(capsule, 'tag'));
    }
  }

  if (capsuleResultCount() < CAPSULE_LIMIT) {
    const recipientRows = await db
      .select({ capsule: capsules })
      .from(capsuleRecipients)
      .innerJoin(capsules, eq(capsules.id, capsuleRecipients.capsuleId))
      .where(
        and(
          eq(capsules.ownerId, ownerId),
          isNull(capsules.trashedAt),
          or(ilike(capsuleRecipients.displayName, like), ilike(capsuleRecipients.email, like)),
        ),
      )
      .limit(CAPSULE_LIMIT);
    for (const { capsule } of recipientRows) {
      if (seenCapsuleIds.has(capsule.id) || capsuleResultCount() >= CAPSULE_LIMIT) continue;
      seenCapsuleIds.add(capsule.id);
      results.push(capsuleResult(capsule, 'recipient'));
    }
  }

  const contactRows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), or(ilike(contacts.name, like), ilike(contacts.email, like))))
    .limit(PERSON_LIMIT);
  for (const row of contactRows) {
    results.push({ kind: 'person', id: row.id, name: row.name, email: row.email });
  }

  const collectionRows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.userId, ownerId), ilike(collections.name, like)))
    .limit(COLLECTION_LIMIT);
  for (const row of collectionRows) {
    results.push({ kind: 'collection', id: row.id, name: row.name });
  }

  return results;
}
