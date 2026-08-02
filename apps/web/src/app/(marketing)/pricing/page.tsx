import type { Metadata } from 'next';
import { Hallmark } from '@tc/ui-web';
import { PlanCards } from '../../../components/marketing/PlanCards';

export const metadata: Metadata = {
  title: 'Pricing — TimelyCapsule',
  description:
    'Free keeps five sealed capsules. Encryption and delivery are never paywalled, and anything you have already sealed still arrives whether or not you keep paying.',
};

/**
 * Pricing (T-21). Plans and prices are `01 §20` verbatim; only Free is
 * purchasable until T-30 wires billing. The two lines under the cards state
 * the ladder's two structural guarantees — trust is never paywalled, and
 * moving up never re-locks anything sealed — because those are `01 §20`'s
 * own commitments, not marketing flourishes.
 */
export default function PricingPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-3">
        <Hallmark>Pricing</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">
          Free is a real tier, not a trial.
        </h1>
        <p className="max-w-[36rem] text-[length:var(--text-body)] text-secondary">
          Zero-access encryption, delivery, and the full export are on every plan, including this one. Paid
          plans add room, not trust.
        </p>
      </header>

      <PlanCards />

      <footer className="flex max-w-[44rem] flex-col gap-2 text-[length:var(--text-body-s)] text-secondary">
        <p>Sealed capsules are delivered regardless of payment state.</p>
        <p>Moving between plans never loses or re-locks anything already sealed.</p>
        <p>Enterprise — SSO, API, SLA — is arranged directly. Guest mode, below Free, needs no account at all.</p>
      </footer>
    </main>
  );
}
