import type { Contact, ContactGroup, CreateContactGroupRequest, CreateContactRequest, PatchContactGroupRequest, PatchContactRequest } from '@tc/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client.js';
import { ApiError } from '../../lib/errors.js';
import { capsuleRecipients, capsules, contactGroupMembers, contactGroups, contacts } from '../../db/schema/index.js';
import { toContact, toContactGroup } from './mappers.js';

type ContactRow = typeof contacts.$inferSelect;
type ContactGroupRow = typeof contactGroups.$inferSelect;

async function findOwnedContactOrThrow(db: Database, ownerId: string, contactId: string): Promise<ContactRow> {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)))
    .limit(1);
  if (!row) throw ApiError.notFound('Contact not found');
  return row;
}

async function findOwnedGroupOrThrow(db: Database, ownerId: string, groupId: string): Promise<ContactGroupRow> {
  const [row] = await db
    .select()
    .from(contactGroups)
    .where(and(eq(contactGroups.id, groupId), eq(contactGroups.ownerId, ownerId)))
    .limit(1);
  if (!row) throw ApiError.notFound('Contact group not found');
  return row;
}

/** How many capsules this owner has sent to the contact's email — the "capsules exchanged" stat (02-UX-DESIGN.md §5.9). */
async function exchangedCounts(db: Database, ownerId: string, emails: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (emails.length === 0) return counts;

  const rows = await db
    .select({ email: capsuleRecipients.email, count: sql<number>`count(distinct ${capsuleRecipients.capsuleId})`.mapWith(Number) })
    .from(capsuleRecipients)
    .innerJoin(capsules, eq(capsules.id, capsuleRecipients.capsuleId))
    .where(and(eq(capsules.ownerId, ownerId), inArray(capsuleRecipients.email, emails)))
    .groupBy(capsuleRecipients.email);

  for (const row of rows) {
    if (row.email) counts.set(row.email.toLowerCase(), row.count);
  }
  return counts;
}

async function groupIdsByContact(db: Database, contactIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (contactIds.length === 0) return map;

  const rows = await db
    .select({ contactId: contactGroupMembers.contactId, groupId: contactGroupMembers.groupId })
    .from(contactGroupMembers)
    .where(inArray(contactGroupMembers.contactId, contactIds));

  for (const row of rows) {
    const existing = map.get(row.contactId) ?? [];
    existing.push(row.groupId);
    map.set(row.contactId, existing);
  }
  return map;
}

export async function listContacts(db: Database, ownerId: string): Promise<Contact[]> {
  const rows = await db.select().from(contacts).where(eq(contacts.ownerId, ownerId));
  const emails = [...new Set(rows.map((r) => r.email).filter((e): e is string => Boolean(e)))];
  const [counts, groupIds] = await Promise.all([
    exchangedCounts(db, ownerId, emails),
    groupIdsByContact(
      db,
      rows.map((r) => r.id),
    ),
  ]);
  return rows.map((row) => toContact(row, row.email ? (counts.get(row.email.toLowerCase()) ?? 0) : 0, groupIds.get(row.id) ?? []));
}

export async function createContact(db: Database, ownerId: string, input: CreateContactRequest): Promise<Contact> {
  const [row] = (await db
    .insert(contacts)
    .values({
      ownerId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      birthday: input.birthday,
      notes: input.notes,
    })
    .returning()) as [ContactRow];
  return toContact(row, 0, []);
}

export async function patchContact(db: Database, ownerId: string, contactId: string, input: PatchContactRequest): Promise<Contact> {
  await findOwnedContactOrThrow(db, ownerId, contactId);
  const [row] = (await db.update(contacts).set(input).where(eq(contacts.id, contactId)).returning()) as [ContactRow];

  const emails = row.email ? [row.email] : [];
  const [counts, groupIds] = await Promise.all([exchangedCounts(db, ownerId, emails), groupIdsByContact(db, [contactId])]);
  return toContact(row, row.email ? (counts.get(row.email.toLowerCase()) ?? 0) : 0, groupIds.get(contactId) ?? []);
}

export async function deleteContact(db: Database, ownerId: string, contactId: string): Promise<void> {
  await findOwnedContactOrThrow(db, ownerId, contactId);
  await db.delete(contacts).where(eq(contacts.id, contactId));
}

// --- Groups ---

export async function listContactGroups(db: Database, ownerId: string): Promise<ContactGroup[]> {
  const rows = await db.select().from(contactGroups).where(eq(contactGroups.ownerId, ownerId));
  return rows.map(toContactGroup);
}

export async function createContactGroup(db: Database, ownerId: string, input: CreateContactGroupRequest): Promise<ContactGroup> {
  const [row] = (await db.insert(contactGroups).values({ ownerId, name: input.name }).returning()) as [ContactGroupRow];
  return toContactGroup(row);
}

export async function patchContactGroup(
  db: Database,
  ownerId: string,
  groupId: string,
  input: PatchContactGroupRequest,
): Promise<ContactGroup> {
  await findOwnedGroupOrThrow(db, ownerId, groupId);
  const [row] = (await db.update(contactGroups).set({ name: input.name }).where(eq(contactGroups.id, groupId)).returning()) as [
    ContactGroupRow,
  ];
  return toContactGroup(row);
}

export async function deleteContactGroup(db: Database, ownerId: string, groupId: string): Promise<void> {
  await findOwnedGroupOrThrow(db, ownerId, groupId);
  await db.delete(contactGroups).where(eq(contactGroups.id, groupId));
}

export async function addContactToGroup(db: Database, ownerId: string, groupId: string, contactId: string): Promise<void> {
  await findOwnedGroupOrThrow(db, ownerId, groupId);
  await findOwnedContactOrThrow(db, ownerId, contactId);
  await db.insert(contactGroupMembers).values({ groupId, contactId }).onConflictDoNothing();
}

export async function removeContactFromGroup(db: Database, ownerId: string, groupId: string, contactId: string): Promise<void> {
  await findOwnedGroupOrThrow(db, ownerId, groupId);
  await db
    .delete(contactGroupMembers)
    .where(and(eq(contactGroupMembers.groupId, groupId), eq(contactGroupMembers.contactId, contactId)));
}
