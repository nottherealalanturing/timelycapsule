import type { Metadata } from 'next';
import Link from 'next/link';
import { Hallmark } from '@tc/ui-web';
import { HELP_ARTICLES } from '../../../lib/marketing/help';

export const metadata: Metadata = {
  title: 'Help — TimelyCapsule',
  description: 'How sealing, delivery, encryption, recovery, and exports work. Plain answers, in order.',
};

/** Help index (T-21) — the ten articles, listed plainly. */
export default function HelpIndexPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-3">
        <Hallmark>Help</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">How it works, plainly.</h1>
      </header>

      <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        {HELP_ARTICLES.map((article) => (
          <li key={article.slug} className="border-t border-[var(--color-rule)] pt-4">
            <Link href={`/help/${article.slug}`} className="motion-instant group flex flex-col gap-1">
              <h2 className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)] group-hover:underline group-hover:underline-offset-4">
                {article.title}
              </h2>
              <p className="text-[length:var(--text-body-s)] text-secondary">{article.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
