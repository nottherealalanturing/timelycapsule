import type { Metadata } from 'next';
import { Hallmark } from '@tc/ui-web';

export const metadata: Metadata = {
  title: 'Privacy Policy — TimelyCapsule',
  description: 'How TimelyCapsule handles your data.',
  robots: { index: false },
};

/**
 * Privacy Policy (T-21). Same 🧑 HUMAN gate as the Terms page — the reviewed
 * document is pasted here; this page is the route and an honest interim
 * notice, `noindex` until then.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-2">
        <Hallmark>Legal</Hallmark>
        <h1 className="text-[length:var(--text-display-s)] leading-[var(--lh-heading)]">Privacy Policy</h1>
      </header>

      <div className="flex max-w-[44rem] flex-col gap-4 text-[length:var(--text-body)] text-secondary">
        <p>The full Privacy Policy is being finalised and will be published here before public launch.</p>
        <p>
          The structural facts it will document already hold: capsule contents are end-to-end encrypted on your
          device and stored by us as ciphertext; analytics are cookie-less and never include anything you write;
          and everything you own can be exported from Settings at any time.
        </p>
        <p>Questions in the meantime: hello@timelycapsule.com.</p>
      </div>
    </main>
  );
}
