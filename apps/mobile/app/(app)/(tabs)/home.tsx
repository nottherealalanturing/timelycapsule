import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { CapsuleRow } from '../../../src/components/capsule-row';
import { EmptyState } from '../../../src/components/empty-state';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import { fromCapsuleListItem } from '../../../src/lib/capsule-row-model';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useCapsules } from '../../../src/lib/use-capsules';

/**
 * The owner's own capsules — "what have I made," not a dashboard. No
 * counts-as-achievements, no activity feed, no filters: `GET /capsules`
 * has no application-level rate limit (per the E1.3 final readiness
 * audit), so this screen fetches exactly once on mount and only makes a
 * second request when the list is actually scrolled to its end — never on
 * refocus, never on a timer. `FlatList`'s own `onEndReached` drives that;
 * `useCapsules()` guards against it firing more than once per page.
 *
 * Time-bucketed grouping and the "In custody" summary line web's dashboard
 * shows (apps/web/src/app/(app)/home/page.tsx) are deliberately not
 * reproduced here — both need every loaded page's data to stay correct as
 * more pages arrive, which is real complexity this ticket's scope doesn't
 * ask for. A flat, server-ordered list is the smallest correct screen.
 */
export default function HomeTab() {
  const { state, retry, loadMore } = useCapsules();
  const router = useRouter();

  const openCapsule = useCallback(
    (id: string) => {
      router.push(`/(app)/capsule/${id}`);
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Your capsules
      </Text>

      {state.status === 'loading' && <LoadingState message="Loading your capsules…" />}

      {state.status === 'error' && <ErrorState message="We couldn't load your capsules." onRetry={retry} />}

      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title="Nothing sealed yet." message="Capsules you create will show up here." />
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <FlatList
          data={state.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CapsuleRow item={fromCapsuleListItem(item)} onPress={openCapsule} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.list}
          ListFooterComponent={<ListFooter nextCursor={state.nextCursor} nextPageError={state.nextPageError} onRetry={loadMore} />}
        />
      )}
    </View>
  );
}

function ListFooter({
  nextCursor,
  nextPageError,
  onRetry,
}: {
  nextCursor: string | null;
  nextPageError: boolean;
  onRetry: () => void;
}) {
  if (nextPageError) {
    return <ErrorState message="We couldn't load more capsules." onRetry={onRetry} />;
  }
  if (nextCursor !== null) {
    return <LoadingState message="Loading more…" />;
  }
  return (
    <View style={styles.endOfList}>
      <Text style={styles.endOfListText}>{"That's everything."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    color: colors.ink,
    padding: space[6],
    paddingBottom: space[2],
  },
  list: {
    paddingBottom: space[6],
  },
  endOfList: {
    paddingVertical: space[6],
    alignItems: 'center',
  },
  endOfListText: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
});
