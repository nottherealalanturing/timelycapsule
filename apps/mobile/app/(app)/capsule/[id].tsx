import type { Capsule } from '@tc/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '../../../src/components/empty-state';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import { decryptCapsuleContent, envelopeText, type DecryptCapsuleContentResult } from '../../../src/lib/capsule-crypto';
import { classifyCapsuleRecord, type CapsuleRecordState } from '../../../src/lib/capsule-detail-state';
import { fromCapsuleListItem } from '../../../src/lib/capsule-row-model';
import { useMasterKey } from '../../../src/lib/master-key-context';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useCapsuleDetail } from '../../../src/lib/use-capsule-detail';

/**
 * Read-only capsule detail (E1.3.8) — the four-state model
 * apps/web/src/components/capsule/LetterRecord.tsx defines (Destroyed/
 * Withheld/Closed/Open), plus the fifth state the E1.3 final readiness
 * audit added explicitly: an owned `draft` with no content written yet
 * (`contentDocEnc`/`ownerKeyWrap` both `null`). Copy for each state is
 * carried over from that component, not reworded, since it is already the
 * product's stated position on each case — not just placeholder text.
 *
 * `masterKey` comes exclusively from `useMasterKey()` (in-memory only,
 * never SecureStore/AsyncStorage); this screen never reads, stores, or
 * forwards it anywhere, and the route param carries only `id` — never
 * decrypted content or key material.
 */
type DecryptPhase = { phase: 'closed' } | { phase: 'decrypting' } | { phase: 'done'; result: DecryptCapsuleContentResult };

export default function CapsuleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, retry } = useCapsuleDetail(id);
  const { masterKey } = useMasterKey();
  // Tracks the result (and which capsule it belongs to) once a decrypt
  // attempt finishes — never set synchronously at the top of the effect
  // below (react-hooks/set-state-in-effect forbids that); "decrypting" is
  // instead derived at render time as "we want a result for this capsule
  // and don't have one yet", not stored as its own state.
  const [decrypted, setDecrypted] = useState<{ capsule: Capsule; result: DecryptCapsuleContentResult } | null>(null);

  const capsule = state.status === 'ready' ? state.capsule : null;
  const record = capsule ? classifyCapsuleRecord(capsule) : null;
  const needsKey = record === 'needs_decrypt';

  useEffect(() => {
    if (!capsule || !needsKey || !masterKey) return;
    let cancelled = false;
    decryptCapsuleContent(capsule, masterKey).then((result) => {
      if (!cancelled) setDecrypted({ capsule, result });
    });
    return () => {
      cancelled = true;
    };
    // `capsule` itself (not just `capsule.id`) is a dependency: a changed
    // ownerKeyWrap/contentDocEnc after a retry-driven refetch must trigger
    // a fresh decrypt, not reuse a stale result keyed only on the id.
  }, [capsule, needsKey, masterKey]);

  const decrypt: DecryptPhase | null = !needsKey
    ? null
    : !masterKey
      ? { phase: 'closed' }
      : decrypted?.capsule === capsule
        ? { phase: 'done', result: decrypted.result }
        : { phase: 'decrypting' };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
        <Text style={styles.backLabel}>‹ Back</Text>
      </TouchableOpacity>

      {state.status === 'loading' && <LoadingState message="Loading…" />}
      {state.status === 'error' && <ErrorState message="We couldn't load this capsule." onRetry={retry} />}

      {capsule && record ? (
        <ScrollView contentContainerStyle={styles.content}>
          <CapsuleHeader capsule={capsule} />
          <RecordSection record={record} decrypt={decrypt} />
        </ScrollView>
      ) : null}
    </View>
  );
}

function CapsuleHeader({ capsule }: { capsule: Capsule }) {
  const row = fromCapsuleListItem(capsule);
  return (
    <View style={styles.header}>
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: row.statusColor }]} />
        <Text style={styles.statusLabel}>{row.statusLabel}</Text>
        {row.dateLabel ? <Text style={styles.date}>{row.dateLabel}</Text> : null}
      </View>
      <Text style={styles.title}>{capsule.title ?? 'Untitled capsule'}</Text>
    </View>
  );
}

/**
 * Renders the "record" — what an owner sees where the letter would be,
 * whatever state it's actually in. Never receives the master key or
 * anything decrypted from outside this component tree's own `decrypt`
 * state; never attempts decryption itself (that already happened, or
 * deliberately didn't, in the screen's effect above).
 */
function RecordSection({ record, decrypt }: { record: CapsuleRecordState; decrypt: DecryptPhase | null }) {
  if (record === 'destroyed') {
    return (
      <View style={styles.record}>
        <Text style={styles.recordText}>
          Destroyed. This was sealed as one reading only — it was destroyed the moment it was read, and there is no
          copy anywhere, including here.
        </Text>
      </View>
    );
  }

  if (record === 'withheld') {
    return (
      <View style={styles.record}>
        <Text style={styles.recordText}>
          Sealed to yourself. What is inside stays unread until it opens — that is the whole of what you asked for.
        </Text>
      </View>
    );
  }

  if (record === 'no_content') {
    return <EmptyState title="Nothing was written yet." message="This capsule hasn't been sealed with a letter." />;
  }

  // record === 'needs_decrypt' from here on — `decrypt` is always non-null in this branch.
  if (!decrypt || decrypt.phase === 'closed') {
    return (
      <View style={styles.record}>
        <Text style={styles.recordText}>
          Closed. Your password unwraps the key that opens this — we never hold it, so it is asked for again after
          every refresh.
        </Text>
      </View>
    );
  }

  if (decrypt.phase === 'decrypting') {
    return (
      <View style={styles.record}>
        <Text style={styles.recordText}>Opening.</Text>
      </View>
    );
  }

  const { result } = decrypt;
  if (result.status !== 'ok') {
    // `invalid_key_wrap` / `decryption_failed` / `malformed_content` all
    // read the same to the owner — none of them is something a retry
    // fixes (the ciphertext and key wrap don't change), and none of them
    // is a detail safe or useful to explain further.
    return (
      <View style={styles.record}>
        <ErrorState message="This capsule couldn't be opened." />
      </View>
    );
  }

  const text = envelopeText(result.envelope);
  const paragraphs = text.split('\n\n').filter((line) => line.trim().length > 0);

  return (
    <View style={styles.record}>
      {paragraphs.length > 0 ? (
        paragraphs.map((line, i) => (
          <Text key={i} style={styles.paragraph}>
            {line}
          </Text>
        ))
      ) : (
        <Text style={styles.recordText}>Nothing was written.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  back: { padding: space[4], alignSelf: 'flex-start' },
  backLabel: { fontSize: fontSize.body, color: colors.muted },
  content: { padding: space[4], paddingTop: 0, gap: space[6] },
  header: { gap: space[2] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: fontSize.caption, fontWeight: fontWeight.medium, color: colors.ink },
  date: { fontSize: fontSize.caption, color: colors.muted },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: colors.ink },
  record: {
    backgroundColor: colors.raised,
    borderRadius: 4,
    padding: space[4],
    gap: space[3],
  },
  recordText: { fontSize: fontSize.body, color: colors.muted },
  paragraph: { fontSize: fontSize.bodyLarge, color: colors.ink, lineHeight: fontSize.bodyLarge * 1.5 },
});
