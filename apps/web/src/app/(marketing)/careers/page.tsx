import type { Metadata } from 'next';
import { Hallmark } from '@tc/ui-web';

export const metadata: Metadata = {
  title: 'Careers — TimelyCapsule',
  description: 'There is currently no position that requires your attention.',
};

/**
 * Careers (Product Quality Pass, 2026-08; pared back same session — see
 * PROGRESS.md). No internal details (team size, hiring rationale) belong on
 * a page for people outside the company, and no explaining ourselves to a
 * stranger either — just the fact, plainly, and the door left open. Same
 * register as `EmptyState`'s "Nothing sealed yet."
 */
export default function CareersPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-3">
        <Hallmark>Careers</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">
          There is currently no position that requires your attention.
        </h1>
      </header>

      <div className="flex max-w-[40rem] flex-col gap-4 text-[length:var(--text-body)] text-secondary">
        <p>
          Want to hear if it changes?{' '}
          <a href="mailto:hello@timelycapsule.com" className="text-foreground underline underline-offset-2 hover:no-underline">
            Write to us
          </a>
          . We read everything. We just don&rsquo;t promise a reply on any particular schedule — which, if you
          think about it, is sort of the whole product.
        </p>
      </div>
    </main>
  );
}
