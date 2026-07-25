import Link from 'next/link';
import { Button } from '@tc/ui-web';

// Minimal placeholder — the full landing per 02-UX-DESIGN.md §5.1 (hero demo
// capsule, how-it-works, use-cases, trust section, FAQ) is T-21's job. This
// just gives (marketing) a real route and a path into signup for T-06's DoD.
export default function MarketingHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-[var(--font-display)] text-4xl text-foreground">TimelyCapsule</h1>
      <p className="max-w-md text-secondary">
        Messages, memories, and media — sealed today, delivered at exactly the right moment.
      </p>
      <div className="flex gap-3">
        <Link href="/signup">
          <Button size="lg">Create your first capsule — free</Button>
        </Link>
        <Link href="/login">
          <Button variant="secondary" size="lg">
            Log in
          </Button>
        </Link>
      </div>
    </main>
  );
}
