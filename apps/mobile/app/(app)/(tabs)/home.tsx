import type { CapsuleListItem } from '@tc/contracts';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CapsuleRow } from '../../../src/components/capsule-row';
import { EmptyState } from '../../../src/components/empty-state';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import { fromCapsuleListItem } from '../../../src/lib/capsule-row-model';
import { colors, fontSize, fontWeight, radius, space } from '../../../src/lib/tokens';
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
  const insets = useSafeAreaInsets();

  // A draft has no letter yet, so the read-only detail screen — the
  // destination for every other state — is the wrong place for its owner
  // to land: it just says "Nothing was written yet." with no way to
  // continue. Drafts route to Address (E1.4.1) instead, where owning and
  // continuing a capsule actually happens; every other state still opens
  // the read-only record, unchanged.
  const openCapsule = useCallback(
    (item: CapsuleListItem) => {
      if (item.state === 'draft') {
        router.push(`/(app)/compose/${item.id}/address`);
      } else {
        router.push(`/(app)/capsule/${item.id}`);
      }
    },
    [router],
  );

  const startNewCapsule = useCallback(() => {
    router.push('/(app)/compose/new');
  }, [router]);

  return (
    <View style={styles.container}>
      {/*
       * `paddingTop: insets.top + space[6]` — the tabs layout renders with
       * `headerShown: false` and no safe-area wrapper of its own, so this
       * header sits flush at y=0 like every other tab screen's does. That
       * was harmless while the header held only static text (as it always
       * has); the "New" button is the first *interactive* control ever
       * placed here, and on-device it landed under the system status bar's
       * own touch-interception zone without this — the same real defect
       * E1.3.8/E1.3.10 already found and fixed for the capsule-detail
       * screen's back button (see that screen's own comment).
       */}
      <View style={[styles.header, { paddingTop: insets.top + space[6] }]}>
        <Text style={styles.title} accessibilityRole="header">
          Your capsules
        </Text>
        <Pressable onPress={startNewCapsule} accessibilityRole="button" accessibilityLabel="New capsule" style={styles.newButton}>
          <Text style={styles.newButtonLabel}>New</Text>
        </Pressable>
      </View>

      {state.status === 'loading' && <LoadingState message="Loading your capsules…" />}

      {state.status === 'error' && <ErrorState message="We couldn't load your capsules." onRetry={retry} />}

      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title="Nothing sealed yet." message="Capsules you create will show up here." />
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <FlatList
          data={state.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CapsuleRow item={fromCapsuleListItem(item)} onPress={() => openCapsule(item)} />}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[6],
    paddingBottom: space[2],
  },
  title: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    color: colors.ink,
  },
  newButton: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  newButtonLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.ink,
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
