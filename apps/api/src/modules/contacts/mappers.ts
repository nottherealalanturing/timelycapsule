import type { Contact, ContactGroup } from '@tc/contracts';
import type { contactGroups, contacts } from '../../db/schema/index.js';

type ContactRow = typeof contacts.$inferSelect;
type ContactGroupRow = typeof contactGroups.$inferSelect;

export function toContact(row: ContactRow, capsulesExchanged: number, groupIds: string[]): Contact {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    birthday: row.birthday,
    linkedUserId: row.linkedUserId,
    notes: row.notes,
    capsulesExchanged,
    groupIds,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toContactGroup(row: ContactGroupRow): ContactGroup {
  return { id: row.id, name: row.name, createdAt: row.createdAt.toISOString() };
}
