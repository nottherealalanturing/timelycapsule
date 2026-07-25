import { EmptyState } from '@tc/ui-web';

// Real Home/Timeline (greeting, "Waiting for you", grid/timeline, filters —
// 02-UX-DESIGN.md §5.4) is T-12. This is the empty state T-06's DoD asks for.
export default function HomePage() {
  return (
    <div className="px-6 py-12">
      <EmptyState title="No capsules yet — create your first one to send it to the future." />
    </div>
  );
}
