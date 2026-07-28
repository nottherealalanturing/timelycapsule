import { z } from 'zod';

/** Sender's own address book — T-16, plan/03-ARCHITECTURE.md §13/§14 "CONTACTS". Distinct from `capsule_recipients` (per-capsule delivery rows). */

export const CreateContactRequestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  birthday: z.string().optional(), // YYYY-MM-DD
  notes: z.string().max(2000).optional(),
});
export type CreateContactRequest = z.infer<typeof CreateContactRequestSchema>;

export const PatchContactRequestSchema = CreateContactRequestSchema.partial();
export type PatchContactRequest = z.infer<typeof PatchContactRequestSchema>;

export const ContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  birthday: z.string().nullable(),
  linkedUserId: z.string().uuid().nullable(),
  notes: z.string().nullable(),
  capsulesExchanged: z.number(),
  groupIds: z.array(z.string().uuid()),
  createdAt: z.string(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const ContactResponseSchema = z.object({ contact: ContactSchema });
export type ContactResponse = z.infer<typeof ContactResponseSchema>;

export const ContactsListResponseSchema = z.object({ data: z.array(ContactSchema) });
export type ContactsListResponse = z.infer<typeof ContactsListResponseSchema>;

// --- Groups ---

export const CreateContactGroupRequestSchema = z.object({ name: z.string().min(1).max(120) });
export type CreateContactGroupRequest = z.infer<typeof CreateContactGroupRequestSchema>;

export const PatchContactGroupRequestSchema = z.object({ name: z.string().min(1).max(120) });
export type PatchContactGroupRequest = z.infer<typeof PatchContactGroupRequestSchema>;

export const ContactGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: z.string(),
});
export type ContactGroup = z.infer<typeof ContactGroupSchema>;

export const ContactGroupResponseSchema = z.object({ group: ContactGroupSchema });
export type ContactGroupResponse = z.infer<typeof ContactGroupResponseSchema>;

export const ContactGroupsListResponseSchema = z.object({ data: z.array(ContactGroupSchema) });
export type ContactGroupsListResponse = z.infer<typeof ContactGroupsListResponseSchema>;

export const SetContactGroupMemberRequestSchema = z.object({ contactId: z.string().uuid() });
export type SetContactGroupMemberRequest = z.infer<typeof SetContactGroupMemberRequestSchema>;
