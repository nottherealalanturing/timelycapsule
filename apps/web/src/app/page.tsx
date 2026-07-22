import { countdownParts } from '@tc/core';

// Placeholder home page — real screens (marketing, auth, app shell) are built
// in T-06 onward per plan/05-BUILD-PLAYBOOK.md. This proves @tc/core and the
// Meridian tokens are wired through the workspace.
const DEMO_TARGET = new Date('2027-06-01T09:00:00Z');

export default function Home() {
  const countdown = countdownParts(DEMO_TARGET, new Date('2026-01-01T00:00:00Z'));

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-[var(--font-display)] text-4xl">TimelyCapsule</h1>
      <p className="text-[var(--color-text-secondary)]">
        Monorepo scaffold online. Demo countdown ({countdown.granularity}):{' '}
        {countdown.years !== undefined
          ? `${countdown.years}y ${countdown.months}m`
          : JSON.stringify(countdown)}
      </p>
    </main>
  );
}
