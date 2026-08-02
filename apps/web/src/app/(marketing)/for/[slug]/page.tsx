import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button, DurationStamp, Hallmark, Record } from '@tc/ui-web';
import { OCCASIONS, getOccasion } from '../../../../lib/marketing/occasions';

const DAY_MS = 24 * 3_600_000;

/**
 * Occasion landing pages (T-21) — `02 §5.1`: "same skeleton, swapped copy +
 * template deep-link — the SEO engine." Statically generated; copy lives in
 * `lib/marketing/occasions.ts`. The CTA deep-links into guest mode, the same
 * no-signup-wall path as the landing hero.
 */
export function generateStaticParams() {
  return OCCASIONS.map((o) => ({ slug: o.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const occasion = getOccasion(slug);
  if (!occasion) return {};
  return { title: occasion.metaTitle, description: occasion.metaDescription };
}

export default async function OccasionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const occasion = getOccasion(slug);
  if (!occasion) notFound();

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-16 px-4 py-16 sm:px-6">
      <header className="flex max-w-[36rem] flex-col gap-4">
        <Hallmark>{occasion.title}</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">{occasion.heading}</h1>
        <p className="text-[length:var(--text-body)] text-secondary">{occasion.lede}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/try">
            <Button size="lg">Write one — free</Button>
          </Link>
          <Link href="/signup">
            <Button variant="secondary" size="lg">
              Create an account
            </Button>
          </Link>
        </div>
      </header>

      <section aria-label="How this works" className="flex max-w-[36rem] flex-col gap-4">
        {occasion.points.map((point, i) => (
          <div key={i} className="flex flex-col gap-1 border-t border-[var(--color-rule)] pt-3">
            <p className="text-[length:var(--text-body-s)] text-secondary">{point}</p>
          </div>
        ))}
      </section>

      {/* The one paper artifact — show the record, not the app (07 §X.4). */}
      <section aria-label="What arrives" className="flex flex-col gap-6">
        <Hallmark>What arrives</Hallmark>
        <div className="max-w-[44rem]">
          <Record as="blockquote" className="flex flex-col gap-5">
            {occasion.sample.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
            <footer>
              <DurationStamp elapsedMs={occasion.stampDays * DAY_MS} />
            </footer>
          </Record>
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-[var(--color-rule)] pt-8">
        <p className="max-w-[36rem] text-[length:var(--text-body-s)] text-secondary">
          Encrypted on your device before it leaves. Sealed until the date you choose. Delivered to a browser —
          no account, no app.
        </p>
        <div>
          <Link href="/try">
            <Button variant="secondary">Write one — free</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
