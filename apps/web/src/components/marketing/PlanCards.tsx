'use client';

import Link from 'next/link';
import { Button, Hallmark } from '@tc/ui-web';
import { useState } from 'react';

/**
 * Plan cards + the annual/monthly toggle (T-21, plans per `01 §20`).
 *
 * Billing does not exist until T-30, so Free is the only plan with a live
 * CTA; paid tiers state their price and "Coming soon" — stated in text, not
 * implied by a disabled button alone (`07 §V.4`). Prices are the `01 §20`
 * table verbatim; nothing here invents a number.
 */
interface Plan {
  name: string;
  monthly: string | null;
  annual: string | null;
  note: string | null;
  rows: string[];
  cta: 'free' | 'soon';
}

/*
 * Two tiers, deliberately.
 *
 * The Business tier ($10/seat, "1000 recipients per campaign") and the Family
 * tier ("6 seats") were removed. *Seats* and *campaigns* are the vocabulary of
 * team software; this product's promise is made to one named person, and `09
 * §IX` established that institutions have a different custody model rather
 * than a bigger plan. A family is likewise not a seat count — the offering is
 * right eventually, but it should be designed from the annual rite (`09 §IV`),
 * not shipped as a number.
 *
 * A product with one job should not present four decisions.
 */
const PLANS: Plan[] = [
  {
    name: 'Free',
    monthly: '$0',
    annual: '$0',
    note: null,
    rows: [
      '5 active sealed capsules',
      '100 MB storage',
      '3 recipients per capsule',
      'Zero-access encryption',
      'Full export, any time',
    ],
    cta: 'free',
  },
  {
    name: 'Premium',
    monthly: '$7.99/mo',
    annual: '$59.99/yr',
    note: 'Coming soon',
    rows: [
      'Unlimited sealed capsules',
      '100 GB storage',
      '20 recipients per capsule',
      'Legacy capsules and trustees',
      'Unlimited seal stacking',
    ],
    cta: 'soon',
  },
];

export function PlanCards() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3" role="group" aria-label="Billing period">
        {(['Monthly', 'Annual'] as const).map((period) => {
          const active = annual === (period === 'Annual');
          return (
            <button
              key={period}
              type="button"
              aria-pressed={active}
              onClick={() => setAnnual(period === 'Annual')}
              className={`motion-instant rounded-[var(--radius-input)] border px-3 py-1.5 text-[length:var(--text-body-s)] ${
                active
                  ? 'border-[var(--color-rule-strong)] text-foreground'
                  : 'border-[var(--color-rule)] text-secondary'
              }`}
            >
              {period}
            </button>
          );
        })}
        <span className="text-[length:var(--text-caption)] text-secondary">Annual is priced at ten months.</span>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-5"
          >
            <div className="flex flex-col gap-1">
              <Hallmark>{plan.name}</Hallmark>
              <p className="font-[family-name:var(--font-mono)] text-[length:var(--text-title-s)] tabular-nums">
                {annual ? plan.annual : plan.monthly}
              </p>
              {plan.note ? (
                <p className="text-[length:var(--text-caption)] text-secondary">{plan.note}</p>
              ) : null}
            </div>
            <ul className="flex flex-1 flex-col gap-2 text-[length:var(--text-body-s)] text-secondary">
              {plan.rows.map((row) => (
                <li key={row} className="border-t border-[var(--color-rule)] pt-2">
                  {row}
                </li>
              ))}
            </ul>
            {plan.cta === 'free' ? (
              <Link href="/signup" className="w-full">
                <Button fullWidth variant="secondary">
                  Start free
                </Button>
              </Link>
            ) : (
              <Button fullWidth variant="ghost" disabled>
                Coming soon
              </Button>
            )}
          </div>
        ))}
      </div>

      {/*
        The one line no competitor can copy, and the reason it belongs on the
        pricing page rather than in the FAQ: "delivery of sealed capsules is
        never gated by payment state" is a hard rule of the system
        (`CLAUDE.md`), not a policy. Stating it here converts an internal
        guarantee into the answer to the fear that actually stops people
        committing to a decade-long product.
      */}
      <div className="flex flex-col gap-3 border-t border-[var(--color-rule)] pt-8">
        <p className="max-w-[42rem] text-[length:var(--text-body)]">
          If you stop paying, everything you have already sealed still arrives.
        </p>
        <p className="max-w-[42rem] text-[length:var(--text-body-s)] text-secondary">
          Sealed capsules are delivered regardless of payment state. Paying changes how much you can seal next —
          never what happens to what you sealed already.
        </p>
      </div>

      {/* Gift Pass — a secondary option beneath the cards, not a third tier. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--color-rule)] pt-8">
        <Hallmark>Gift pass</Hallmark>
        <p className="text-[length:var(--text-body-s)] text-secondary">
          $4.99 once — a single sealed capsule for someone without an account. Coming soon.
        </p>
      </div>
    </div>
  );
}
