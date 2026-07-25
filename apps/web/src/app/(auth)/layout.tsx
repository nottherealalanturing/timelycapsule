import Link from 'next/link';
import { ThemeToggle } from '@tc/ui-web';

// Single centered card (max 400), logo, warm gradient bg — shared chrome
// for /signup, /login, /reset, /verify per 02-UX-DESIGN.md §5.2.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-12"
      style={{
        background:
          'radial-gradient(ellipse at top, color-mix(in srgb, var(--color-accent-gold) 12%, transparent), var(--color-bg-primary) 60%)',
      }}
    >
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="font-[var(--font-display)] text-2xl text-foreground">
        TimelyCapsule
      </Link>
      <div className="w-full max-w-[400px] rounded-[var(--radius-card)] bg-[var(--color-bg-raised)] p-8 shadow-[var(--shadow-md)]">
        {children}
      </div>
    </div>
  );
}
