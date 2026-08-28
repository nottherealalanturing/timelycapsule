import type { ReceivedCapsule } from '@tc/contracts';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CapsuleRow } from '../../../src/components/capsule-row';
import { EmptyState } from '../../../src/components/empty-state';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import { fromReceivedCapsule } from '../../../src/lib/capsule-row-model';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useReceivedCapsules } from '../../../src/lib/use-received-capsules';

/**
 * Section order and headings match web's Received page exactly
 * (apps/web/src/app/(app)/received/page.tsx's `SECTION_HEADING` and
 * `sections` array) — not invented here. A section with no items is
 * omitted entirely rather than shown empty, same as web.
 */
const SECTION_ORDER: ReceivedCapsule['section'][] = ['waiting', 'upcoming', 'opened'];
const SECTION_HEADING: Record<ReceivedCapsule['section'], string> = {
  waiting: 'Ready to open',
  upcoming: 'Still sealed',
  opened: 'Opened',
};

/**
 * `GET /received` is deliberately unpaginated (returns the caller's
 * complete inbox in one response — see use-received-capsules.ts), so a
 * plain `ScrollView` over the mapped rows is enough; there is no next page
 * to fetch and no list large enough here to need `FlatList`'s
 * virtualization. This also keeps the screen renderable end-to-end under
 * react-test-renderer with the project's existing minimal `react-native`
 * mock, with no separate mock needed for a virtualized list component.
 */
export default function ReceivedTab() {
  const { state, retry } = useReceivedCapsules();
  const router = useRouter();

  const openCapsule = useCallback(
    (id: string) => {
      // E1.3.8 (capsule detail screen) has not been built yet. This is the
      // route it is planned to provide — `app/(app)/capsule/[id].tsx`, per
      // plan/STAGE-E-MOBILE-V1-E1.3-FINAL-READINESS-AUDIT.md's confirmed
      // navigation structure (id-only param, pushed from Home/Received,
      // not a tab). Pushing here now is structurally correct and will
      // start working the moment that route file exists; it is not this
      // ticket's job to create it.
      router.push(`/(app)/capsule/${id}`);
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Received
      </Text>

      {state.status === 'loading' && <LoadingState message="Loading what's been sent to you…" />}

      {state.status === 'error' && <ErrorState message="We couldn't load what's been sent to you." onRetry={retry} />}

      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState title="Nothing has been sent to you yet." />
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <ScrollView contentContainerStyle={styles.list}>
          {SECTION_ORDER.map((section) => {
            const sectionItems = state.items.filter((item) => item.section === section);
            if (sectionItems.length === 0) return null;
            return (
              <View key={section}>
                <Text style={styles.sectionHeading}>{SECTION_HEADING[section]}</Text>
                {sectionItems.map((item) => (
                  <CapsuleRow key={item.recipientId} item={fromReceivedCapsule(item)} onPress={openCapsule} />
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
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
  sectionHeading: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    color: colors.muted,
    textTransform: 'uppercase',
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[1],
  },
});
