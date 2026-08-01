import { notFound } from 'next/navigation';
import { Button, EmptyState, Hallmark, Record, Skeleton, StateChip, type CapsuleState } from '@tc/ui-web';
import { SpecimenClient } from './SpecimenClient';

/**
 * Meridian V2 primitive specimen — the living component gallery.
 *
 * Development only. This is a design-system verification surface, not a
 * product route: it exists so every primitive can be checked in both
 * registers and both themes at once, and so contrast can be measured
 * against real rendered components rather than replicas.
 */
export const metadata = { robots: { index: false, follow: false } };

const STATES: CapsuleState[] = ['draft', 'sealing', 'sealed', 'unlocked', 'expired', 'withdrawn'];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-[var(--color-rule)] pt-8">
      <div className="flex flex-col gap-1">
        <Hallmark>{title}</Hallmark>
        {note ? <p className="max-w-[60ch] text-[length:var(--text-body-s)] text-secondary">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function SpecimenPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto flex max-w-[900px] flex-col gap-10 px-6 py-14">
      <header className="flex flex-col gap-2">
        <Hallmark>Meridian V2 · primitives</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-tight)]">Component specimen</h1>
        <p className="max-w-[60ch] text-secondary">
          Every primitive, in both registers. The instrument register is this page. The record register is the
          bounded paper object below — note that it keeps its own palette and serif in both themes.
        </p>
      </header>

      <Section title="Buttons" note="Fills carry a measured foreground token. Loading keeps its label and sets aria-busy — never a spinner.">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Seal capsule</Button>
          <Button variant="secondary">Save draft</Button>
          <Button variant="ghost">Cancel</Button>
          <Button variant="destructive">Delete permanently</Button>
          <Button variant="primary" loading>
            Sealing
          </Button>
          <Button variant="primary" disabled>
            Unavailable
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title="Capsule states" note="Brass appears on `sealed` and nowhere else. No state animates — the label carries the meaning.">
        <div className="flex flex-wrap gap-2">
          {STATES.map((s) => (
            <StateChip key={s} state={s} />
          ))}
        </div>
      </Section>

      <Section title="Fields" note="Focus is the interactive token via focus-visible, so it appears for keyboard users without firing on mouse clicks.">
        <SpecimenClient />
      </Section>

      <Section title="Placeholder" note="Static by construction. It reserves space and nothing else — nothing in this product may read as loading.">
        <div className="flex max-w-[420px] flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Section>

      <Section
        title="The record register"
        note="Paper and serif, permanently, in both themes. Bounded on all four sides with the instrument surround visible — a lit document in a dark room, never a move to a light room."
      >
        <Record as="article" className="max-w-[560px]">
          <Hallmark>TC-84KZQM3P · sealed 14 March 2026</Hallmark>
          <h2 className="mt-3 text-[length:var(--text-title)] leading-[var(--lh-heading)]">Letter to my daughter</h2>
          <p className="mt-4">Amara,</p>
          <p className="mt-3">
            By the time you read this you&rsquo;ll be eighteen. I&rsquo;ve spent three years wondering what to say,
            and I still don&rsquo;t know. So I&rsquo;ll just say this &mdash;
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--color-rule)] pt-4">
            <StateChip state="unlocked" />
            <Button variant="secondary" size="sm">
              Download a copy
            </Button>
            <Hallmark>travelled 3 y 0 m 0 d</Hallmark>
          </div>
        </Record>
        <p className="max-w-[60ch] text-[length:var(--text-body-s)] text-secondary">
          The chip and button above are the same components as everywhere else. They re-registered on their own
          because <code className="font-[family-name:var(--font-mono)]">.tc-record</code> re-points the semantic
          tokens for its subtree.
        </p>
      </Section>

      <Section title="Empty state" note="One line, one action. No illustration, no mascot, no encouragement.">
        <EmptyState title="Nothing sealed yet." action={<Button>Write something</Button>} />
      </Section>
    </main>
  );
}
