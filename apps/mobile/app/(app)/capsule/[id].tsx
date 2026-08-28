import type { Capsule, Recipient } from '@tc/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../../src/components/empty-state';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import {
  decryptCapsuleContent,
  envelopeText,
  resolveCapsuleKey,
  type DecryptCapsuleContentResult,
} from '../../../src/lib/capsule-crypto';
import { classifyCapsuleRecord, type CapsuleRecordState } from '../../../src/lib/capsule-detail-state';
import { fromCapsuleListItem } from '../../../src/lib/capsule-row-model';
import { useMasterKey } from '../../../src/lib/master-key-context';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useCapsuleDetail } from '../../../src/lib/use-capsule-detail';
import { useCapsuleRecipients, type RecipientsState } from '../../../src/lib/use-capsule-recipients';
import { useCapsuleReplies, type DecryptedReply, type RepliesState } from '../../../src/lib/use-capsule-replies';

/**
 * Read-only capsule detail (E1.3.8) — the four-state model
 * apps/web/src/components/capsule/LetterRecord.tsx defines (Destroyed/
 * Withheld/Closed/Open), plus the fifth state the E1.3 final readiness
 * audit added explicitly: an owned `draft` with no content written yet
 * (`contentDocEnc`/`ownerKeyWrap` both `null`). Copy for each state is
 * carried over from that component, not reworded, since it is already the
 * product's stated position on each case — not just placeholder text.
 *
 * E1.3.9 adds two read-only supporting sections, in the same order web's
 * page renders them: replies (inside the letter's own reading, since a
 * reply is capsule content encrypted under the same key) then recipients
 * (page-level "Addressed to" metadata, further down). Recipients show
 * whenever the capsule loaded, regardless of record state — they are
 * addressing metadata, not the letter, matching
 * `apps/web/src/app/(app)/capsule/[id]/page.tsx`'s own recipients query,
 * which is gated only on `Boolean(capsule)`. Replies show only once the
 * letter itself has successfully decrypted (`needs_decrypt` + `ok`) — they
 * need the same capsule key, so there is nothing to show for
 * Destroyed/Withheld/Closed/no-content, and deliberately nothing shown
 * (rather than a second, redundant failure box) when the letter's own
 * decrypt failed instead of succeeding.
 *
 * `masterKey` comes exclusively from `useMasterKey()` (in-memory only,
 * never SecureStore/AsyncStorage); this screen never reads, stores, or
 * forwards it anywhere, and the route param carries only `id` — never
 * decrypted content or key material.
 */
type DecryptPhase = { phase: 'closed' } | { phase: 'decrypting' } | { phase: 'done'; result: DecryptCapsuleContentResult };

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

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
  const letterOk = decrypt?.phase === 'done' && decrypt.result.status === 'ok';

  // The capsule key, re-resolved once the letter has already proven it
  // successfully — a second, cheap AES unwrap (no KDF) rather than
  // widening `decryptCapsuleContent`'s own return shape, which E1.3.7
  // already shipped and this ticket doesn't need to touch.
  const [resolvedKey, setResolvedKey] = useState<{ capsule: Capsule; key: Uint8Array } | null>(null);
  useEffect(() => {
    if (!capsule || !letterOk || !masterKey) return;
    let cancelled = false;
    resolveCapsuleKey(capsule.ownerKeyWrap, masterKey).then((result) => {
      if (!cancelled && result.status === 'ok') setResolvedKey({ capsule, key: result.capsuleKey });
    });
    return () => {
      cancelled = true;
    };
  }, [capsule, letterOk, masterKey]);
  const capsuleKey = resolvedKey?.capsule === capsule ? resolvedKey.key : null;

  // Recipients are addressing metadata, not the letter — shown whenever the
  // capsule loaded, for every record state except Destroyed/Withheld
  // (matching web's own unconditional recipients query, which the product
  // still doesn't show for those two states since apps/web/src/app/(app)/
  // capsule/[id]/page.tsx never even reaches its recipients section's
  // sibling `LetterRecord` output for them — the section itself has no
  // such gate, but this screen adds one deliberately: showing "addressed
  // to Ada" beside "destroyed, no copy anywhere" would read as a
  // contradiction the product doesn't intend).
  const showRecipients = record === 'no_content' || record === 'needs_decrypt';
  const { state: recipientsState, retry: retryRecipients } = useCapsuleRecipients(capsule?.id ?? '', Boolean(capsule) && showRecipients);
  const { state: repliesState, retry: retryReplies } = useCapsuleReplies(capsule?.id ?? '', capsuleKey);

  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/*
       * `paddingTop: insets.top` — without it, this is the only screen in
       * the app with a touchable sitting flush at y=0: every tab screen's
       * title has enough padding to clear the status bar incidentally, but
       * this back control didn't, so on some devices the status bar's own
       * system window sits on top of it and swallows the touch before it
       * ever reaches the app — for a sighted tap and, confirmed this
       * session via a real on-device accessibility-tree inspection with
       * TalkBack running, for TalkBack's focus+double-tap activation too
       * (the control was correctly labeled/focusable, but genuinely
       * unreachable). A previously-known, previously-documented visual
       * finding (see plan/PROGRESS.md's E1.3.8/E1.3.10 entries) turned out
       * to be a real accessibility defect, not just a cosmetic one — this
       * is the minimal fix, not a broader nav/layout change.
       */}
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { paddingTop: insets.top + space[4] }]}
      >
        <Text style={styles.backLabel}>‹ Back</Text>
      </TouchableOpacity>

      {state.status === 'loading' && <LoadingState message="Loading…" />}
      {state.status === 'error' && <ErrorState message="We couldn't load this capsule." onRetry={retry} />}

      {capsule && record ? (
        <ScrollView contentContainerStyle={styles.content}>
          <CapsuleHeader capsule={capsule} />
          <RecordSection record={record} decrypt={decrypt} />
          <RepliesSection state={repliesState} onRetry={retryReplies} />
          <RecipientsSection state={recipientsState} onRetry={retryRecipients} />
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Grouped into one accessible header block (state, date, and title spoken
 * together as "Unlocked. Aug 28, 2026. A letter to future me.") rather than
 * three separate swipe stops — the status dot carries no label of its own
 * and is never individually focusable once grouped, so state reaches a
 * screen reader as the same text sighted users see (`statusLabel`), never
 * as color alone.
 */
function CapsuleHeader({ capsule }: { capsule: Capsule }) {
  const row = fromCapsuleListItem(capsule);
  const label = [row.statusLabel, row.dateLabel, capsule.title ?? 'Untitled capsule'].filter(Boolean).join('. ');
  return (
    <View style={styles.header} accessible accessibilityRole="header" accessibilityLabel={label}>
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
      <View style={styles.record} accessibilityLiveRegion="polite">
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

/**
 * "What was written back" — one block per recipient thread that actually
 * has replies (an empty thread renders nothing, matching
 * `Correspondence.tsx`'s `if (replies.length === 0 && !onSend) return null`;
 * this screen has no `onSend`, so that's the only condition left).
 * Deliberately not a chat UI: no bubbles, no avatars, no alignment by
 * author, no unread state — entries in the order the API already returns
 * them (oldest first), each stating who and when.
 */
function RepliesSection({ state, onRetry }: { state: RepliesState; onRetry: () => void }) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <View style={styles.section}>
        <LoadingState message="Loading replies…" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.section}>
        <ErrorState message="We couldn't load the replies to this capsule." onRetry={onRetry} />
      </View>
    );
  }

  const threadsWithReplies = state.threads.filter((thread) => thread.replies.length > 0);
  if (threadsWithReplies.length === 0) return null;

  return (
    <>
      {threadsWithReplies.map((thread) => (
        <View key={thread.recipientId} style={styles.section}>
          <Text style={styles.sectionHeading} accessibilityRole="header">
            What was written back
          </Text>
          {thread.replies.map((reply) => (
            <ReplyEntry key={reply.id} reply={reply} theirName={thread.recipientLabel ?? 'Them'} />
          ))}
        </View>
      ))}
    </>
  );
}

/**
 * Grouped into one accessible block ("Ada Lovelace. Aug 28, 2026. Thank you
 * for writing this.") rather than separate stops for author, date, and each
 * line — a short reply read as a single coherent unit, not three-plus
 * fragments a screen-reader user has to swipe through and mentally
 * reassemble. The composed label carries only text already rendered
 * on-screen (already-decrypted plaintext, or the same safe failure copy
 * shown sighted users) — never ciphertext, never a key.
 */
function ReplyEntry({ reply, theirName }: { reply: DecryptedReply; theirName: string }) {
  const who = reply.author === 'sender' ? 'You' : theirName;
  const lines = reply.text ? reply.text.split('\n').filter((line) => line.trim().length > 0) : [];
  const body = reply.text === null ? "This could not be opened with the key for this capsule." : lines.join(' ');
  const label = [who, formatDate(reply.createdAt), body].filter(Boolean).join('. ');

  return (
    <View style={styles.replyEntry} accessible accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.replyMeta}>
        <Text style={styles.replyWho}>{who}</Text>
        <Text style={styles.date}>{formatDate(reply.createdAt)}</Text>
      </View>
      {reply.text === null ? (
        <Text style={styles.recordText}>This could not be opened with the key for this capsule.</Text>
      ) : lines.length > 0 ? (
        lines.map((line, i) => (
          <Text key={i} style={styles.recordText}>
            {line}
          </Text>
        ))
      ) : null}
    </View>
  );
}

/**
 * "Addressed to" — plaintext addressing metadata, never anything encrypted.
 * Shown whenever the capsule loaded (see the screen's own comment on
 * `showRecipients` for which record states that excludes); hidden entirely
 * when there are no recipients yet, matching web's own
 * `recipients.length > 0 ? <section>...</section> : null`.
 */
function RecipientsSection({ state, onRetry }: { state: RecipientsState; onRetry: () => void }) {
  if (state.status === 'idle' || state.status === 'loading') return null;

  if (state.status === 'error') {
    return (
      <View style={styles.section}>
        <ErrorState message="We couldn't load who this was addressed to." onRetry={onRetry} />
      </View>
    );
  }

  if (state.recipients.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeading} accessibilityRole="header">
        Addressed to
      </Text>
      {state.recipients.map((recipient) => (
        <RecipientRow key={recipient.id} recipient={recipient} />
      ))}
    </View>
  );
}

/** Grouped into one accessible block ("Ada Lovelace, opened") rather than two separate stops for name and status — the status text is the same product terminology sighted users see, never color alone. */
function RecipientRow({ recipient }: { recipient: Recipient }) {
  const label = recipient.displayName || recipient.email || recipient.phone || 'Someone';
  const status = recipient.status.replace(/_/g, ' ');
  return (
    <View style={styles.recipientRow} accessible accessibilityRole="text" accessibilityLabel={`${label}, ${status}`}>
      <Text style={styles.recipientLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.recipientStatus}>{status}</Text>
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
  section: { gap: space[3] },
  sectionHeading: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  replyEntry: {
    backgroundColor: colors.raised,
    borderRadius: 4,
    padding: space[4],
    gap: space[2],
  },
  replyMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  replyWho: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.ink },
  recipientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space[3],
    paddingVertical: space[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  recipientLabel: { flex: 1, fontSize: fontSize.body, color: colors.ink },
  recipientStatus: { fontSize: fontSize.caption, color: colors.muted },
});
