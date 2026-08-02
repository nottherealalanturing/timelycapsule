import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Hallmark } from '@tc/ui-web';
import { HELP_ARTICLES, getHelpArticle } from '../../../../lib/marketing/help';

/** A help article (T-21). Statically generated from `lib/marketing/help.ts`. */
export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) return {};
  return { title: `${article.title} — TimelyCapsule Help`, description: article.summary };
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-[length:var(--text-body-s)]">
        <Link href="/help" className="motion-instant text-secondary hover:text-foreground">
          Help
        </Link>
      </nav>

      <article className="flex max-w-[44rem] flex-col gap-6">
        <header className="flex flex-col gap-2">
          <Hallmark>Help</Hallmark>
          <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">{article.title}</h1>
        </header>
        <div className="flex flex-col gap-4">
          {article.body.map((para, i) => (
            <p key={i} className="text-[length:var(--text-body)] leading-[var(--lh-body)] text-secondary">
              {para}
            </p>
          ))}
        </div>
      </article>

      <footer className="border-t border-[var(--color-rule)] pt-6 text-[length:var(--text-body-s)] text-secondary">
        <Link href="/help" className="motion-instant text-foreground underline underline-offset-4">
          All help articles
        </Link>
      </footer>
    </main>
  );
}
