'use client';

import type { Contact } from '@tc/contracts';
import { Button, Dialog, EmptyState, Input, Skeleton } from '@tc/ui-web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { contactGroupsApi, contactsApi } from '../../../lib/api-client';

interface ContactFormState {
  name: string;
  email: string;
  phone: string;
  birthday: string;
  notes: string;
}

const EMPTY_FORM: ContactFormState = { name: '', email: '', phone: '', birthday: '', notes: '' };

/** Days until the contact's next birthday (this year, or next year if it already passed) — 02-UX-DESIGN.md §5.9's "turns 30 in 3 weeks" copy. */
function daysUntilNextBirthday(birthday: string, now: Date): number {
  const [, month, day] = birthday.split('-').map(Number);
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next.getTime() < now.setHours(0, 0, 0, 0)) {
    next = new Date(now.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - now.getTime()) / 86_400_000);
}

function turningAge(birthday: string, now: Date): number {
  const [year] = birthday.split('-').map(Number);
  const daysUntil = daysUntilNextBirthday(birthday, new Date(now));
  const birthdayYear = new Date(now.getTime() + daysUntil * 86_400_000).getFullYear();
  return birthdayYear - year;
}

function formatDaysUntil(days: number): string {
  if (days === 0) return 'today';
  if (days < 14) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `in ${Math.round(days / 7)} weeks`;
}

function ContactSheet({
  open,
  onOpenChange,
  initial,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ContactFormState;
  onSubmit: (form: ContactFormState) => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<ContactFormState>(initial);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={initial.name ? 'Edit contact' : 'Add contact'} width="sm">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(form);
        }}
      >
        <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input
          label="Birthday"
          type="date"
          value={form.birthday}
          onChange={(e) => setForm({ ...form, birthday: e.target.value })}
        />
        <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Button type="submit" loading={submitting} disabled={!form.name.trim()}>
          Save
        </Button>
      </form>
    </Dialog>
  );
}

export default function PeoplePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.list(),
  });
  const allContacts = data?.data ?? [];
  const contacts = groupFilter ? allContacts.filter((c) => c.groupIds.includes(groupFilter)) : allContacts;

  const { data: groupsData } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: () => contactGroupsApi.list(),
  });
  const groups = groupsData?.data ?? [];

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => contactGroupsApi.create({ name }),
    onSuccess: () => {
      setNewGroupName('');
      void queryClient.invalidateQueries({ queryKey: ['contact-groups'] });
    },
  });

  const toggleGroupMembership = useMutation({
    mutationFn: async ({ contact, groupId, member }: { contact: Contact; groupId: string; member: boolean }) =>
      member ? contactGroupsApi.removeMember(groupId, contact.id) : contactGroupsApi.addMember(groupId, contact.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const [mountedAtMs] = useState(() => Date.now());

  const upcomingBirthdays = useMemo(() => {
    const now = new Date(mountedAtMs);
    return contacts
      .filter((c) => c.birthday)
      .map((c) => ({ contact: c, daysUntil: daysUntilNextBirthday(c.birthday!, new Date(now)) }))
      .filter((c) => c.daysUntil <= 60)
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [contacts, mountedAtMs]);

  const createMutation = useMutation({
    mutationFn: (form: ContactFormState) =>
      contactsApi.create({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        birthday: form.birthday || undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      setSheetOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (form: ContactFormState) => {
      if (!editing) throw new Error('No contact selected');
      return contactsApi.patch(editing.id, {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        birthday: form.birthday || undefined,
        notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setSheetOpen(false);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.delete(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['contacts'] }),
  });

  function startCapsuleFor(contact: Contact) {
    const params = new URLSearchParams();
    if (contact.email) params.set('recipientEmail', contact.email);
    if (contact.phone) params.set('recipientPhone', contact.phone);
    params.set('recipientName', contact.name);
    router.push(`/capsule/new?${params}`);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 px-8 py-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">People</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setSheetOpen(true);
          }}
        >
          Add contact
        </Button>
      </div>

      {upcomingBirthdays.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-secondary">Upcoming birthdays</h2>
          <div className="flex flex-col gap-2">
            {upcomingBirthdays.map(({ contact, daysUntil }) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 p-3"
              >
                <p className="text-sm text-foreground">
                  {contact.name} turns {turningAge(contact.birthday!, new Date(mountedAtMs))} {formatDaysUntil(daysUntil)}
                </p>
                <Button size="sm" variant="secondary" onClick={() => startCapsuleFor(contact)}>
                  Start a capsule
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setGroupFilter(null)}
            className={`rounded-[var(--radius-pill)] border px-3 py-1 text-sm ${
              groupFilter === null ? 'border-accent bg-accent text-foreground' : 'border-[var(--color-text-secondary)]/30 text-secondary'
            }`}
          >
            All
          </button>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setGroupFilter(group.id)}
              className={`rounded-[var(--radius-pill)] border px-3 py-1 text-sm ${
                groupFilter === group.id
                  ? 'border-accent bg-accent text-foreground'
                  : 'border-[var(--color-text-secondary)]/30 text-secondary'
              }`}
            >
              {group.name}
            </button>
          ))}
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (newGroupName.trim()) createGroupMutation.mutate(newGroupName.trim());
            }}
          >
            <Input
              label="New group"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="h-8 w-28 text-sm"
            />
            <Button type="submit" size="sm" variant="ghost" disabled={!newGroupName.trim()}>
              +
            </Button>
          </form>
        </div>

        <h2 className="text-sm font-medium text-secondary">Contacts</h2>
        {contacts.length === 0 ? (
          <EmptyState title="No contacts yet." action={<Button onClick={() => setSheetOpen(true)}>Add your first contact</Button>} />
        ) : (
          <div className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/15 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{contact.name}</p>
                  <p className="truncate text-sm text-secondary">
                    {[contact.email, contact.phone].filter(Boolean).join(' · ') || 'No contact info'}
                    {` · ${contact.capsulesExchanged} capsule${contact.capsulesExchanged === 1 ? '' : 's'} exchanged`}
                  </p>
                  {groups.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {groups.map((group) => {
                        const member = contact.groupIds.includes(group.id);
                        return (
                          <button
                            key={group.id}
                            type="button"
                            onClick={() => toggleGroupMembership.mutate({ contact, groupId: group.id, member })}
                            className={`rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs ${
                              member ? 'border-accent bg-accent text-foreground' : 'border-[var(--color-text-secondary)]/30 text-secondary'
                            }`}
                          >
                            {group.name}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" onClick={() => startCapsuleFor(contact)}>
                    New capsule
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(contact);
                      setSheetOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(contact.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ContactSheet
        key={editing?.id ?? 'new'}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        initial={
          editing
            ? {
                name: editing.name,
                email: editing.email ?? '',
                phone: editing.phone ?? '',
                birthday: editing.birthday ?? '',
                notes: editing.notes ?? '',
              }
            : EMPTY_FORM
        }
        onSubmit={(form) => (editing ? patchMutation.mutate(form) : createMutation.mutate(form))}
        submitting={createMutation.isPending || patchMutation.isPending}
      />
    </div>
  );
}
