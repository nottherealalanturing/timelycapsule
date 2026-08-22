import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Hallmark } from '@tc/ui-web';
import { ArrivalDemo } from '../../components/marketing/ArrivalDemo';
import { OrbitScrub } from '../../components/marketing/OrbitScrub';
import { HeroClock } from '../../components/marketing/HeroClock';
import { HeroMeridianSpine } from '../../components/marketing/HeroMeridianSpine';
import { WriteAndSeal } from '../../components/marketing/WriteAndSeal';

export const metadata: Metadata = {
  title: 'TimelyCapsule — sealed until the date you choose',
  description:
    'Write a letter, seal it until a date you choose, and it is delivered — encrypted on your device, kept for years, opened in any browser.',
};

/**
 * The landing page, rebuilt to `07 §X` ("Landing Page Philosophy · T-21").
 *
 * Its structure is that section's five numbered rules, in order: the thesis
 * clock, the compressed wait, survival evidence, one paper artifact, and no
 * testimonials. The sections `02 §5.1` lists that survive the rebuild
 * (how-it-works, use cases, pricing teaser, FAQ, footer) follow after,
 * restated in the `07 §VIII` voice. The hero CTA now routes straight into
 * `/try` rather than the on-page demo — guest mode itself is unchanged
 * ("no signup wall between the landing page and writing", `02 §5.1`), only
 * the number of hops to reach it. `/try` is the real Capsule Creation V2
 * composer now, not a lighter stand-in for it, so the on-page demo
 * (`WriteAndSeal`, §"Write one" below) is positioned as a bridge into that
 * real thing rather than a second, competing composer.
 *
 * Post-M0–M5 product-quality pass (Landing Page V2): "The years between" —
 * a third `DualClock`-in-a-card reading, visually repeating the hero and
 * the Orbit Scrub, and the one section with a real horizontal-overflow bug
 * at 375px (a `size="lg"` clock inside padded card constraints) — was
 * removed rather than patched. Its ideas aren't lost: the instrument-carries
 * -the-wait feeling it existed to demonstrate is already carried twice
 * (hero, Orbit Scrub); its reachability/export facts already duplicated
 * existing "How it is kept" answers; its one genuinely new idea (nothing to
 * maintain while it waits) didn't need restating — no engagement mechanic
 * exists anywhere in the product for it to be a promise about.
 *
 * Tempo: `07 §X`'s unusual rule — slower than the app, in tempo not
 * performance. That is carried by spacing and by how little happens, not by
 * animation: scroll-jacking and parallax are permanently banned (`07 §XVI`),
 * so the page is still, and the only things that move are the thesis clock
 * (once a second) and whatever the visitor moves themselves.
 */

const SURVIVAL: { q: string; a: string }[] = [
  {
    q: 'Can you read what I write?',
    a: 'No. Contents are encrypted on your device before they leave it. Our servers store ciphertext. There is no support tool, admin view, or recovery path that shows us a capsule’s contents — the key never reaches us.',
  },
  {
    q: 'What does the recipient need?',
    a: 'A link. No account, no app, no download. The reveal page works in ordinary browsers, including old phones.',
  },
  {
    q: 'What if I stop paying?',
    a: 'Sealed capsules are delivered regardless of payment state. That is a rule of the system, not a policy we could quietly change.',
  },
  {
    q: 'What if TimelyCapsule disappears?',
    a: 'The honest answer is the export: everything you own — letters, files, metadata — downloads as ordinary files, today, from Settings. It is not a promise about a rainy day; it already works.',
  },
  {
    q: 'Does a capsule have to be kept forever?',
    a: 'Not if you seal it that way. Some things aren’t meant to be kept — choose "one reading only" and it disappears the moment it has been read. No copy remains, not even ours.',
  },
  {
    q: 'What happens to photos and files after a while?',
    a: 'On a free account, enclosed photos and files are kept for a year after the capsule opens, then reclaimed. The letter and everything it says are kept regardless — only the bytes are ever reclaimed.',
  },
];

/*
 * Durations, not personas. `09 §IV`'s life events are the source, and the
 * span is the thing a visitor actually recognises about their own situation —
 * "eighteen years" locates you faster than "for new parents" does.
 */
const OCCASIONS: { href: string; span: string; title: string; line: string }[] = [
  {
    href: '/for/new-parents',
    span: 'Eighteen years',
    title: 'For a child, from now',
    line: 'Written while they are small. Opened when they can read it.',
  },
  {
    href: '/for/letters-to-my-future-self',
    span: 'Ten years',
    title: 'To your future self',
    line: 'A letter that waits until you are someone slightly different.',
  },
  {
    href: '/for/couples',
    span: 'One year, then every year',
    title: 'Between two people',
    line: 'Anniversaries measured in years travelled, not notifications.',
  },
];

/*
 * Objections, not features. `07 §X` — the page's job is to answer the only
 * question that matters and the small fears attached to it. Two were missing
 * and both block a decade-long commitment: what happens when the sender dies,
 * and what happens when the recipient's address does.
 */
const FAQ: { q: string; a: string; href?: string }[] = [
  {
    q: 'Can I change it after sealing?',
    a: 'No. Contents are immutable once sealed — that is what sealing means. You can still add or remove recipients until it opens, extend the date once, or withdraw it entirely.',
    href: '/help/what-is-sealing',
  },
  {
    q: 'What if they change email address?',
    a: 'We check we can still reach them long before the date, and tell you if we cannot — while there is still time to fix it. A capsule that arrives nowhere is the failure we design hardest against.',
  },
  {
    q: 'What if I die before it opens?',
    a: 'It still opens. Delivery does not depend on you being here, logging in, or renewing anything — that is the entire point of sealing it.',
  },
  {
    q: 'Can I open one early?',
    a: 'Not by default. Sealing means sealed. For capsules to yourself you can allow a break-glass early opening at the moment you seal it.',
    href: '/help/can-i-open-early',
  },
  {
    q: 'What if I forget my password?',
    a: 'Your recovery code — shown once at signup — restores access. Without either, contents are unrecoverable by design. We cannot read them, so we cannot recover them for you.',
    href: '/help/recovery-code',
  },
  {
    q: 'What does the recipient do?',
    a: 'They open a link. No account, no app, no download. It works in ordinary browsers, including old phones.',
    href: '/help/recipient-guide',
  },
];

export default function MarketingHome() {
  return (
    <main>
      {/* 1 · The thesis. `07 §X.1` — the page opens with a real duration,
          moving, with no explanation: the Dual Clock itself, unhoused. A bare
          clock still read as a smaller version of every card below it, so the
          Meridian — device 5, "the axis" — now runs as the hero's literal
          structural spine: a full-height line dividing what you are told from
          what you are shown, with the same approach/temperature reading every
          waiting card uses, at architectural rather than instrument scale.
          Nothing below repeats this treatment — each section owns one device
          (`07 §III` — five, and no more), and this is the one place the
          Meridian is the layout rather than a widget inside it. */}
      <section aria-label="What this is" className="border-b border-[var(--color-rule)]">
        <div className="mx-auto grid w-full max-w-[1200px] items-stretch gap-0 px-4 pb-24 pt-20 sm:px-6 sm:pb-28 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_5rem_22rem]">
          <div className="flex max-w-[34rem] flex-col justify-center gap-6">
            <h1 className="text-[length:var(--text-display)] leading-[var(--lh-tight)]">
              What you seal will come back. Exactly when you said.
            </h1>
            <p className="text-[length:var(--text-body-l)] leading-[var(--lh-body)] text-secondary">
              Write a letter, choose the day it opens, and it is kept until then — encrypted on your device
              before it leaves.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/try">
                <Button size="lg">Write one now</Button>
              </Link>
              <a href="#kept">
                <Button variant="secondary" size="lg">
                  How it is kept
                </Button>
              </a>
            </div>
          </div>

          <HeroMeridianSpine />

          <HeroClock />
        </div>
      </section>

      {/* 2 · Compress the wait (`07 §X.2`) — the one permitted spectacle.
          Two columns, matching the hero and §5: copy sets the task, the
          instrument answers it. A single narrow column here left the right
          half of the section empty while its neighbours were balanced. */}
      <section aria-label="Ten years, compressed" className="border-t border-[var(--color-rule)]">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16">
          <div className="flex max-w-[32rem] flex-col gap-3">
            <Hallmark>Ten years, compressed</Hallmark>
            <h2 className="text-[length:var(--text-title)] leading-[var(--lh-heading)]">
              A decade is longer than it sounds.
            </h2>
            <p className="text-[length:var(--text-body)] leading-[var(--lh-body)] text-secondary">
              Drag through ten years and watch a real capsule count them. This is the screen you would come back
              to.
            </p>
          </div>
          <OrbitScrub />
        </div>
      </section>

      {/* 3 · Write one · 4 · Seal it — the turn from reading to meaning it.
          The generic numbered "How it works" cards this replaces described
          three steps the visitor can now simply perform. */}
      <section id="write" aria-label="Write one" className="border-t border-[var(--color-rule)]">
        {/* Two columns, as §1 and §2 already are: the copy sets the task on
            the left, the instrument answers it on the right. Stacked
            full-width, this left the right half of a wide screen empty while
            both its neighbours were balanced. */}
        <div className="mx-auto grid w-full max-w-[1200px] items-start gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_34rem] lg:gap-16">
          <div className="flex max-w-[30rem] flex-col gap-2">
            <Hallmark>Write one</Hallmark>
            <h2 className="text-[length:var(--text-title)] leading-[var(--lh-heading)]">
              There is probably someone you would write to.
            </h2>
            <p className="text-[length:var(--text-body)] text-secondary">
              No account, nothing sent. Write a line, choose when it opens, and seal it — the same way the real
              thing works.
            </p>
          </div>
          <WriteAndSeal />
        </div>
      </section>

      {/* What arrives — Gate 1's register change, played on demand.
          Replaces a static Record, which described the payoff instead of
          delivering it. */}
      <section aria-label="What arrives" className="border-t border-[var(--color-rule)]">
        {/* The record needs its width — it is a document, and `04 §8` makes
            the 65–72ch reading measure a brand-level constraint. So the copy
            sits beside it rather than above, giving the section a right-hand
            edge without narrowing the artifact. */}
        <div className="mx-auto grid w-full max-w-[1200px] items-start gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
          <div className="flex flex-col gap-3">
            <Hallmark>What arrives</Hallmark>
            <h2 className="text-[length:var(--text-title)] leading-[var(--lh-heading)]">
              On the day, the instrument gives way to the letter.
            </h2>
            {/* Post-M0–M5: the product no longer ends at delivery — a
                recipient can write back, encrypted the same way the letter
                was. One sentence extends the section's existing arc rather
                than adding a "Replies" feature card; `07 §X` still governs
                (show the record, don't enumerate capabilities). */}
            <p className="text-[length:var(--text-body)] leading-[var(--lh-body)] text-secondary">
              And if they write back, you will hear it too — the letter does not have to be the last word.
            </p>
          </div>
          <ArrivalDemo />
        </div>
      </section>

      {/* 3 · Answer survival with evidence (07 §X.3). Boring and specific. */}
      <section id="kept" aria-label="How it is kept" className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-24 sm:px-6">
          <div className="flex flex-col gap-2">
            <Hallmark>How it is kept</Hallmark>
            <h2 className="max-w-[32rem] text-[length:var(--text-title)] leading-[var(--lh-heading)]">
              Will you still be here in 2041?
            </h2>
            <p className="max-w-[36rem] text-[length:var(--text-body)] text-secondary">
              It is the only question that really matters, and charm is not an answer. These are the specific
              ones.
            </p>
          </div>
          <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {SURVIVAL.map((item) => (
              <div key={item.q} className="flex flex-col gap-2">
                <dt className="text-[length:var(--text-body)] font-medium">{item.q}</dt>
                <dd className="text-[length:var(--text-body-s)] text-secondary">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Use cases — links into the occasion pages (02 §5.1). */}
      <section aria-label="Occasions" className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-24 sm:px-6">
          <div className="flex flex-col gap-2">
            <Hallmark>Occasions</Hallmark>
            <h2 className="max-w-[32rem] text-[length:var(--text-title)] leading-[var(--lh-heading)]">
              Most people already have a date in mind.
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
          {OCCASIONS.map((o) => (
            <Link
              key={o.href}
              href={o.href}
              className="motion-instant flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-6 hover:border-[var(--color-rule-strong)] hover:bg-[var(--color-bg-overlay)]"
            >
              <Hallmark>{o.span}</Hallmark>
              <h3 className="text-[length:var(--text-title-s)] leading-[var(--lh-heading)]">{o.title}</h3>
              <p className="text-[length:var(--text-body-s)] text-secondary">{o.line}</p>
            </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 9 · What it costs — its own section. Bundling pricing, the FAQ and
          the final CTA into one block was the last catch-all on the page, and
          a catch-all is what makes a page read as a marketing site. */}
      <section aria-label="What it costs" className="border-t border-[var(--color-rule)]">
        {/* The right column states the free tier's actual limits as a reading
            — the same hallmarked term/figure pairing the app uses for capsule
            metadata — rather than a decorative graphic (`07 §XII`: the imagery
            of the product is its own artifacts, and illustration is banned
            permanently). The section was otherwise two sentences on an
            otherwise empty band. */}
        <div className="mx-auto grid w-full max-w-[1200px] items-start gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16">
          <div className="flex max-w-[34rem] flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Hallmark>What it costs</Hallmark>
              <h2 className="text-[length:var(--text-title)] leading-[var(--lh-heading)]">
                Free is enough to prove it works.
              </h2>
            </div>
            <p className="text-[length:var(--text-body)] text-secondary">
              Five sealed capsules, full encryption, full export. Encryption and delivery are never paywalled —
              and anything you have already sealed still arrives whether or not you keep paying.
            </p>
            <div>
              <Link href="/pricing" className="motion-instant text-foreground underline decoration-[var(--color-rule-strong)] underline-offset-4 hover:decoration-[var(--color-interactive)]">
                See both plans
              </Link>
            </div>
          </div>

          <dl className="flex flex-col gap-0">
            {/* Labeled explicitly rather than relying on the paragraph beside
                it: a reader who lands on the numbers first, out of the copy's
                reading order, should not mistake a Free-tier reading for a
                product-wide ceiling. */}
            <Hallmark className="pb-1">Free plan</Hallmark>
            {[
              { term: 'Sealed capsules', figure: 'Five' },
              { term: 'Storage', figure: '100 MB' },
              // The scheduling engine's real ceiling is 50 years (`01 §Scheduling`),
              // not unlimited — "No limit" overstated a plan's actual capability,
              // which is exactly the wrong kind of claim on a page whose central
              // question is "will you still be here."
              { term: 'Longest horizon', figure: 'Up to 50 years' },
              { term: 'Encryption', figure: 'Always on' },
              { term: 'Export', figure: 'Included' },
              { term: 'Price', figure: 'Free' },
            ].map((row) => (
              <div
                key={row.term}
                className="flex items-baseline justify-between gap-4 border-t border-[var(--color-rule)] py-3"
              >
                <dt className="text-[length:var(--text-body-s)] text-secondary">{row.term}</dt>
                <dd className="font-[family-name:var(--font-mono)] text-[length:var(--text-body-s)] tabular-nums">
                  {row.figure}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* 10 · Questions — objections, not features. */}
      <section aria-label="Questions" className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-24 sm:px-6">
          <div className="flex flex-col gap-2">
            <Hallmark>Questions</Hallmark>
            <h2 className="max-w-[32rem] text-[length:var(--text-title)] leading-[var(--lh-heading)]">
              The ones that actually stop people.
            </h2>
          </div>
          <dl className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-2 border-t border-[var(--color-rule)] pt-4">
                <dt className="text-[length:var(--text-body)] font-medium">{item.q}</dt>
                <dd className="text-[length:var(--text-body-s)] text-secondary">
                  {item.a}{' '}
                  {item.href ? (
                    <Link href={item.href} className="motion-instant text-foreground underline decoration-[var(--color-rule-strong)] underline-offset-4 hover:decoration-[var(--color-interactive)]">
                      More
                    </Link>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The close. One action, stated — not urged. */}
      <section aria-label="Start" className="border-t border-[var(--color-rule)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-7 px-4 py-24 sm:px-6">
          <h2 className="max-w-[26rem] text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">
            There is a date you already know.
          </h2>
          <div>
            <Link href="/try">
              <Button size="lg">Write one — free</Button>
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
