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

const QUESTIONS = [
  'What do you want {name} to know that you might not say out loud?',
  'What is true today that you expect to have forgotten?',
  'Describe this exact moment — the room, the weather, the noise.',
  'What are you hoping will have changed by the time this opens?',
  'What would you want {name} to know if you could not tell them yourself?',
  'What is a promise you are making, to them or to yourself?',
];

export interface MarginPromptProps {
  /** Addressee's name, folded into the question where one is known. */
  addressee: string | null;
  className?: string;
}

export function MarginPrompt({ addressee, className }: MarginPromptProps) {
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const question = QUESTIONS[index % QUESTIONS.length]!.replace('{name}', addressee ?? 'them');

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
