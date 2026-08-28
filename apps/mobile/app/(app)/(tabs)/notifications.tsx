import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../../../src/components/empty-state';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import { NotificationRow } from '../../../src/components/notification-row';
import { fromNotification } from '../../../src/lib/notification-model';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useNotifications } from '../../../src/lib/use-notifications';

/**
 * In-app notifications are pull-only — no WebSocket, no push delivery, no
 * badge-count endpoint exists (E1.3 final readiness audit). This screen
 * fetches exactly once on mount, same reasoning as Home: `GET
 * /notifications` has no application-level rate limit, so nothing here
 * refetches on focus, on a timer, or via pull-to-refresh.
 */
export default function NotificationsTab() {
  const { state, retry, loadMore } = useNotifications();
  const router = useRouter();

  const openCapsule = useCallback(
    (capsuleId: string) => {
      router.push(`/(app)/capsule/${capsuleId}`);
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Notifications
      </Text>

      {state.status === 'loading' && <LoadingState message="Loading your notifications…" />}

      {state.status === 'error' && <ErrorState message="We couldn't load your notifications." onRetry={retry} />}

      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title="Nothing yet." message="Activity on your capsules will show up here." />
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <FlatList
          data={state.items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <NotificationRow item={fromNotification(item)} onPress={openCapsule} />}
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
    return <ErrorState message="We couldn't load more notifications." onRetry={onRetry} />;
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
