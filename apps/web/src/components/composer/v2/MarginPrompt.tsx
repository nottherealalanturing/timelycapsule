'use client';

import { cn } from '@tc/ui-web';
import { useState } from 'react';

/**
 * Questions, never templates.
 *
 * `07 §IX` is explicit about both halves of this. Templates, AI-written
 * suggestions and mood pickers are forbidden because they produce a letter the
 * person did not write, and the only thing that gives the artifact value is
 * that it is theirs. A question does the opposite — it produces their words.
 *
 * And: *"One at a time, dismissible, never inserted into the document."* V1
 * inserted the chosen prompt into the letter as a blockquote, which is us
 * writing in someone else's letter. This one cannot reach the document; it has
 * no access to the editor at all.
 */

/**
 * Two banks rather than one templated with a pronoun swap. `{name}` filled
 * with a fallback like "them" reads as addressed to a third party no matter
 * what the fallback says, and by the time this renders a null addressee
 * always means a self capsule — Address requires either a recipient or
 * "Myself" before Compose is reachable. A capsule to yourself asking what you
 * want *them* to know, directly under a hallmark reading "FOR YOURSELF", was
 * the kind of small disagreement that makes a surface feel unconsidered.
 */
const QUESTIONS_FOR_OTHERS = [
  'What do you want {name} to know that you might not say out loud?',
  'What is true today that you expect to have forgotten?',
  'Describe this exact moment — the room, the weather, the noise.',
  'What are you hoping will have changed by the time this opens?',
  'What would you want {name} to know if you could not tell them yourself?',
  'What is a promise you are making, to them or to yourself?',
];

const QUESTIONS_FOR_SELF = [
  'What do you want your future self to know that you might not say out loud?',
  'What is true today that you expect to have forgotten?',
  'Describe this exact moment — the room, the weather, the noise.',
  'What are you hoping will have changed by the time this opens?',
  'What would you want to remember, if nothing else survived but this?',
  'What is a promise you are making to yourself?',
];

export interface MarginPromptProps {
  /** Addressee's name. Null means a self capsule — Address never reaches Compose otherwise. */
  addressee: string | null;
  className?: string;
}

/**
 * `addressee` is also used as a Hallmark label ("FOR AMARA@EXAMPLE.COM"),
 * where an email or phone number reads fine as an identifier. Slotted into
 * this component's own sentences instead — "What do you want
 * amara@example.com to know" — the same string reads as a typo, not an
 * address. A recipient without a saved display name still gets the OTHERS
 * bank (this is not a self capsule), just with the neutral "them" in place
 * of a name that was never a name to begin with.
 */
function isDisplayName(value: string): boolean {
  return !value.includes('@') && !/^[+\d][\d\s-]*$/.test(value);
}

export function MarginPrompt({ addressee, className }: MarginPromptProps) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const bank = addressee ? QUESTIONS_FOR_OTHERS : QUESTIONS_FOR_SELF;
  const name = addressee && isDisplayName(addressee) ? addressee : 'them';
  const question = bank[index % bank.length]!.replace('{name}', name);

  return (
    <aside
      aria-label="A question, if it helps"
      className={cn('flex flex-col gap-3 text-[length:var(--text-body-s)] text-secondary', className)}
    >
      <p className="leading-[1.55]">{question}</p>
      <div className="flex gap-4 text-[length:var(--text-caption)]">
        <button
          type="button"
          onClick={() => setIndex((i) => i + 1)}
          className="text-[var(--color-interactive)] underline-offset-2 hover:underline"
        >
          Another
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-secondary underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
