import Link from 'next/link';
import { Lockup, ThemeToggle } from '@tc/ui-web';

/**
 * Shared chrome for /signup, /login, /reset and /verify.
 *
 * Meridian V2 rebuild. One substantive correction beyond tokens:
 *
 * **V1 painted a radial brass gradient behind this screen.** `05` reserves
 * brass for *waiting* and nothing else — "the moment it decorates a heading,
 * the reserved meaning is gone." A decorative brass wash on the most-visited
 * unauthenticated page is the fastest possible way to spend that reservation,
 * and it was spending it on a login form, where nothing is waiting.
 *
 * The ground is now plain instrument. The card is the only lifted object,
 * which is also what makes it read as the thing to attend to.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-14">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <Link
        href="/"
        className="motion-instant rounded-[var(--radius-input)] px-2 py-1 opacity-90 hover:opacity-100"
      >
        <Lockup size={26} />
      </Link>

      <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-[var(--color-rule)] bg-[var(--color-bg-raised)] p-8 shadow-md">
        {children}
      </div>
    </div>
  );
}
