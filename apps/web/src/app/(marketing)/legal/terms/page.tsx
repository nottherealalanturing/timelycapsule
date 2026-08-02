import type { Metadata } from 'next';
import { Hallmark } from '@tc/ui-web';

export const metadata: Metadata = {
  title: 'Terms of Service — TimelyCapsule',
  description: 'The terms governing use of TimelyCapsule.',
  robots: { index: false },
};

/**
 * Terms of Service (T-21). The ticket marks the document itself as a 🧑 HUMAN
 * step — "generate from a template service e.g. Termly free, review, paste" —
 * because binding legal text needs human review, not generation. This page is
 * the route, the layout, and an honest interim notice; it is `noindex` until
 * the reviewed document is pasted in, so a placeholder never ranks.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-2">
        <Hallmark>Legal</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">Terms of Service</h1>
      </header>

      <div className="flex max-w-[44rem] flex-col gap-4 text-[length:var(--text-body)] text-secondary">
        <p>The full Terms of Service are being finalised and will be published here before public launch.</p>
        <p>
          Two commitments already govern the service and will survive into the final document unchanged: capsule
          contents are encrypted on your device and cannot be read by us, and delivery of sealed capsules is
          never conditional on payment state.
        </p>
        <p>Questions in the meantime: hello@timelycapsule.com.</p>
      </div>
    </main>
  );
}
