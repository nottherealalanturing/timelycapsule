// Recipient reveal experience per 02-UX-DESIGN.md §5.7 — built in Stage C
// (T-14+). This stub just establishes the (reveal) route group/segment so
// the URL shape (`/c/:token`) is reserved ahead of time.
export default async function RevealPage({ params }: { params: Promise<{ token: string }> }) {
  await params;
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="text-secondary">This capsule isn&apos;t ready to open yet. Check back soon.</p>
    </main>
  );
}
