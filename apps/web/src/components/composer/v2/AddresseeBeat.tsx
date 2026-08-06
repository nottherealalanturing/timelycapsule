'use client';

import type { Contact, Recipient } from '@tc/contracts';
import { Button, cn, Input } from '@tc/ui-web';
import { useState } from 'react';

export interface AddresseeBeatProps {
  /** 'self' addresses the writer; anything else addresses named recipients. */
  isSelf: boolean;
  onChangeIsSelf: (isSelf: boolean) => void;
  recipients: Recipient[];
  contacts: Contact[];
  onAdd: (input: { email?: string; phone?: string; displayName?: string }) => Promise<void>;
  onRemove: (id: string) => void;
  error?: string | null;
  className?: string;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function matches(contact: Contact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return Boolean(
    contact.name.toLowerCase().includes(q) ||
      contact.email?.toLowerCase().includes(q) ||
      contact.phone?.includes(q),
  );
}

/**
 * Who this is for — the first question the composer asks.
 *
 * `07 §IX` names the blank page as the point where people abandon, and gives
 * addressing the reader as one of only two things that help. Asking it first is
 * the whole reason Address is a movement rather than a section further down a
 * scroll: a letter to *someone* is writable in a way that a letter to nobody in
 * particular is not, and knowing who they are is also what makes their future
 * age computable one beat later.
 *
 * The two choices are stated as sentences rather than chips because this is a
 * decision about the letter, not a filter. V1 rendered them as `disabled`
 * chips with "Type is set at creation" — true at the time, and the reason the
 * question was effectively unanswerable inside the composer.
 */
export function AddresseeBeat({
  isSelf,
  onChangeIsSelf,
  recipients,
  contacts,
  onAdd,
  onRemove,
  error,
  className,
}: AddresseeBeatProps) {
  const [input, setInput] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const suggestions = suggestionsOpen ? contacts.filter((c) => matches(c, input)).slice(0, 5) : [];

  async function submit(overrides?: { email?: string; phone?: string; displayName?: string }) {
    const value = input.trim();
    const payload = overrides ?? (isEmail(value) ? { email: value } : value ? { phone: value } : null);
    if (!payload) return;
    setAdding(true);
    try {
      await onAdd(payload);
      setInput('');
      setSuggestionsOpen(false);
    } finally {
      setAdding(false);
    }
  }

  return (
    <section aria-label="Who this is for" className={cn('flex flex-col gap-4', className)}>
      <h2 className="text-[length:var(--text-body-l)] font-medium text-foreground">Who is this for?</h2>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Choice
          selected={!isSelf}
          onSelect={() => onChangeIsSelf(false)}
          title="Someone else"
          detail="They are told when it opens"
        />
        <Choice
          selected={isSelf}
          onSelect={() => onChangeIsSelf(true)}
          title="Myself"
          detail="It comes back to you, and no one else"
        />
      </div>

      {isSelf ? null : (
        <div className="flex flex-col gap-3">
          {recipients.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {recipients.map((r) => (
                <li key={r.id}>
                  <span className="flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-rule-strong)] px-3 py-1.5 text-[length:var(--text-body-s)] text-foreground">
                    {r.displayName || r.email || r.phone}
                    <button
                      type="button"
                      onClick={() => onRemove(r.id)}
                      aria-label={`Remove ${r.displayName || r.email || r.phone}`}
                      className="text-secondary"
                    >
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="relative flex items-end gap-2">
            <div className="flex-1">
              <Input
                label={recipients.length > 0 ? 'Anyone else?' : 'Their email or phone'}
                // A different example than the first field's: once a real
                // "amara@example.com" is already sitting in the chip list
                // above, echoing the same string back as a placeholder here
                // reads like it was entered twice.
                placeholder={recipients.length > 0 ? 'jordan@example.com' : 'amara@example.com'}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submit();
                  }
                }}
              />
              {suggestions.length > 0 ? (
                <ul className="absolute z-20 mt-1 w-full rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] py-1 shadow-md">
                  {suggestions.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          void submit({
                            email: contact.email ?? undefined,
                            phone: contact.phone ?? undefined,
                            displayName: contact.name,
                          })
                        }
                        className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-[length:var(--text-body-s)] hover:bg-[var(--color-bg-primary)]"
                      >
                        <span className="text-foreground">{contact.name}</span>
                        <span className="text-[length:var(--text-caption)] text-secondary">
                          {contact.email ?? contact.phone}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <Button type="button" variant="secondary" loading={adding} onClick={() => void submit()}>
              Add
            </Button>
          </div>

          {error ? (
            <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Choice({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-1 flex-col gap-0.5 rounded-[var(--radius-input)] border px-4 py-3 text-left',
        selected
          ? 'border-[var(--color-interactive)] bg-[var(--color-bg-raised)]'
          : 'border-[var(--color-rule-strong)] hover:bg-[var(--color-bg-raised)]',
      )}
    >
      <span className="text-[length:var(--text-body-s)] font-medium text-foreground">{title}</span>
      <span className="text-[length:var(--text-caption)] text-secondary">{detail}</span>
    </button>
  );
}
