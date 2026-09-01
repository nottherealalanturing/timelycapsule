import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { capsulesApi } from '../../../../src/lib/api-client';
import { ErrorState } from '../../../../src/components/error-state';
import { LoadingState } from '../../../../src/components/loading-state';
import { envelopeToText } from '../../../../src/lib/capsule-crypto';
import { randomIdempotencyKey } from '../../../../src/lib/media-upload';
import { describeScheduleProblem } from '../../../../src/lib/schedule-validity';
import { describeSealFailure, type SealProblem } from '../../../../src/lib/seal-errors';
import { colors, fontSize, fontWeight, radius, space } from '../../../../src/lib/tokens';
import { useCapsuleCompose } from '../../../../src/lib/use-capsule-compose';
import { useMediaEnclosures } from '../../../../src/lib/use-media-enclosures';

/**
 * Movement III — Review/Seal (E1.4.8). Reproduces the product semantics of
 * `apps/web/src/components/composer/v2/SealMovement.tsx` and the governing
 * decision named directly in its own header comment and
 * `design/21-CAPSULE-CREATION-V2.md §V`: **confidence, not confirmation.** A
 * confirmation dialog asks you to assent to a summary; this screen *is* the
 * record — the actual letter, the actual enclosures, the actual address,
 * exactly as they will be received — so that sealing follows from having
 * seen the real thing, not from clicking past a card of facts.
 *
 * **Reuses `useCapsuleCompose` and `useMediaEnclosures` as-is, unchanged.**
 * This screen does not resolve, generate, or receive a capsule key of its
 * own — it never encrypts anything (nothing is edited here), so it has no
 * cryptographic need for one at all. `useCapsuleCompose`'s bootstrap effect
 * still runs on mount (an independent, correct re-unwrap of the *same*
 * already-existing `ownerKeyWrap` under the same master key — never a new
 * key, since `ownerKeyWrap` is already set by the time Review is reachable);
 * this screen only reads the envelope/capsule/recipients it produces. This
 * mirrors Compose's own relationship to Address exactly: mobile's
 * established per-screen architecture always re-derives from the server
 * rather than passing state through navigation params.
 *
 * **What Review shows** — audited directly against `SealMovement.tsx`, not
 * assumed: who/when (the same reading Compose's own `Hallmark` gives, now
 * inside the record itself), the real letter paragraphs, the real enclosed
 * media (name only — see the security note below), the irreversibility
 * statement stated once, and the Seal action. **Deliberately not built**,
 * disclosed rather than silent: the optional "Called" title field (not in
 * this ticket's own audited "at minimum" checklist, and mobile has no
 * capsules-list surface yet where a private filing name would even matter)
 * and the Conditions detour (Place/Passphrase/Identity seals, retention
 * options, delivery toggles, break-glass) — matching the readiness audit's
 * own §4.5 recommendation to defer this complexity, and "unavailable
 * capabilities are omitted, not shown disabled" (`design/21-CAPSULE-
 * CREATION-V2.md §VII`): mobile simply has no Conditions row, the same way
 * it has none of the other things this build doesn't support yet.
 *
 * **Media stays name-only — never decrypted here.** Review lists each
 * attached enclosure by its plaintext metadata (`originalName`, already
 * known from the ticket/complete calls — never the encrypted bytes
 * themselves), exactly like web's own `item.caption || item.originalName`.
 * No mobile media-viewer/decrypt path exists yet (out of E1.4.8's scope,
 * not silently expanded into one) — this screen was never asked to build
 * one, so it doesn't.
 *
 * **The seal request carries no cryptographic artifact at all.** `POST
 * /capsules/:id/seal` has an empty body (confirmed directly in
 * `apps/api/src/modules/capsules/lifecycle.ts`'s `sealCapsule` — it reads
 * only the already-persisted draft row); the capsule key that encrypted the
 * content and media stays exactly where E1.4.3/E1.4.7 already put it — it
 * is never sent, wrapped differently, or placed in a URL fragment at seal
 * time. The bare-key URL-fragment link (`encodeCapsuleKeyForLink`) is a
 * *recipient-announce* concern, not a seal concern — see the disclosed
 * limitation below.
 *
 * **Known, disclosed limitation — the "something is waiting" announce
 * email.** `announce_on_seal` defaults `true` server-side, and web's own
 * `sealCapsule` deliberately does *not* schedule that email itself (its own
 * comment: the server may never hold the bare capsule key the recipient
 * link needs, so the owner's browser builds and sends it, immediately after
 * a successful seal, via `POST .../recipients/:id/announce`). Building that
 * requires capturing each recipient's one-time raw `accessToken` at the
 * moment `POST .../recipients` responds — something E1.4.1's own Address
 * screen explicitly does not do today (its own header comment: "this ticket
 * has no use for yet — announcing a link is E1.4.8's job"). Retrofitting
 * token capture into an already-shipped, already-merged ticket is a real
 * scope reach-back this ticket was not asked to make, and hard rule 5
 * (delivery is never gated by anything here) means the capsule still
 * delivers correctly on schedule regardless — only the early heads-up email
 * is skipped. Disclosed, not silently dropped.
 */
export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, retry } = useCapsuleCompose(id);
  const { items, pending } = useMediaEnclosures(id, null);

  const [now] = useState(() => Date.now());
  const [sealing, setSealing] = useState(false);
  const [sealProblem, setSealProblem] = useState<SealProblem | null>(null);
  // Generated once per mount of this screen, not per attempt — reused across
  // any retry of the same seal, exactly like `media-upload.ts`'s own
  // ticket-creation key. See `capsulesApi.seal`'s own header comment for why.
  const [sealIdempotencyKey] = useState(() => randomIdempotencyKey());

  const capsule = state.status === 'ready' ? state.capsule : null;
  const recipients = state.status === 'ready' ? state.recipients : [];
  const isSelf = capsule?.type === 'self';
  const addressee = isSelf ? null : recipients[0]?.displayName || recipients[0]?.email || recipients[0]?.phone || null;
  const opensAt = capsule?.unlockAt ? new Date(capsule.unlockAt) : null;
  const lines = state.status === 'ready' ? paragraphs(envelopeToText(state.envelope)) : [];

  // Failed items don't block sealing client-side — matching web's own
  // `enclosuresInFlight` computation (`Composer.tsx`:
  // `pending.filter((p) => p.stage !== 'failed').length`) exactly. A failed
  // item left un-retried and un-removed still blocks sealing, just
  // server-side, via the real `upload_incomplete` 409 this screen already
  // maps to a specific message — the client-side gate is a UX nicety, never
  // the actual enforcement, same as everywhere else in this product.
  const enclosuresInFlight = pending.filter((p) => p.stage !== 'failed').length;

  const scheduleProblem = describeScheduleProblem(opensAt, now);

  const goToAddress = useCallback(() => {
    router.push(`/(app)/compose/${id}/address`);
  }, [id, router]);

  const handleSeal = useCallback(async () => {
    setSealing(true);
    setSealProblem(null);
    try {
      await capsulesApi.seal(id, sealIdempotencyKey);
      // No SealCeremony on mobile yet (the held-beat animation is untouched,
      // out-of-scope visual polish, disclosed above) — a sealed capsule is
      // immutable, so `replace` rather than `push` deliberately leaves
      // Compose/Review off the back stack: there is nothing left to edit.
      router.replace('/(app)/(tabs)/home');
    } catch (error) {
      setSealProblem(describeSealFailure(error));
    } finally {
      setSealing(false);
    }
  }, [id, router, sealIdempotencyKey]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.back, { paddingTop: insets.top + space[4] }]}
      >
        <Text style={styles.backLabel}>‹ Back</Text>
      </Pressable>

      {state.status === 'loading' && <LoadingState message="Loading…" />}
      {state.status === 'error' && <ErrorState message="We couldn't load this capsule." onRetry={retry} />}

      {state.status === 'ready' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading} accessibilityRole="header">
            Read it once more.
          </Text>

          <View style={styles.record} accessible={false}>
            <Text style={styles.recordHallmark} accessibilityRole="text">
              {addressee ? `For ${addressee}` : 'For yourself'}
            </Text>
            {opensAt ? (
              <Text style={styles.recordHallmark} accessibilityRole="text">
                Opens {opensAt.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
                {opensAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            ) : null}

            <View style={styles.recordRule} />

            {lines.length > 0 ? (
              <View style={styles.letterLines}>
                {lines.map((line, i) => (
                  <Text key={i} style={styles.letterLine}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.letterEmpty}>Nothing written yet.</Text>
            )}

            {items.length > 0 ? (
              <>
                <View style={styles.recordRule} />
                <View style={styles.enclosedList}>
                  <Text style={styles.enclosedHeading}>Enclosed</Text>
                  {items.map((item) => (
                    <Text key={item.id} style={styles.enclosedItem}>
                      {enclosureGlyph(item.kind)}
                      {'  '}
                      {item.caption || item.originalName}
                    </Text>
                  ))}
                </View>
              </>
            ) : null}
          </View>

          {enclosuresInFlight > 0 ? (
            <Text style={styles.statusText} accessibilityRole="text" accessibilityLiveRegion="polite">
              {enclosuresInFlight === 1 ? 'One enclosure is' : `${enclosuresInFlight} enclosures are`} still arriving. Sealing waits for
              them.
            </Text>
          ) : null}

          <View style={styles.irreversibility}>
            <Text style={styles.irreversibilityText}>
              Once sealed, what is inside cannot be changed. You can withdraw it at any time before it opens.
            </Text>
          </View>

          {scheduleProblem ? (
            <View style={styles.alert} accessibilityRole="alert">
              <Text style={styles.alertText}>{scheduleProblem.message}</Text>
              <Pressable onPress={goToAddress} accessibilityRole="button" accessibilityLabel="Choose a new moment">
                <Text style={styles.alertAction}>Choose a new moment</Text>
              </Pressable>
            </View>
          ) : null}

          {sealProblem && !scheduleProblem ? (
            <View style={styles.alert} accessibilityRole="alert">
              <Text style={styles.alertText}>{sealProblem.message}</Text>
              {sealProblem.goToAddress ? (
                <Pressable onPress={goToAddress} accessibilityRole="button" accessibilityLabel="Go to Address">
                  <Text style={styles.alertAction}>Go to Address</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            onPress={() => void handleSeal()}
            disabled={sealing || enclosuresInFlight > 0 || scheduleProblem !== null || sealProblem?.retryable === false}
            accessibilityRole="button"
            accessibilityLabel={sealing ? 'Sealing…' : 'Seal capsule'}
            accessibilityState={{
              disabled: sealing || enclosuresInFlight > 0 || scheduleProblem !== null || sealProblem?.retryable === false,
              busy: sealing,
            }}
            style={[
              styles.sealButton,
              (sealing || enclosuresInFlight > 0 || scheduleProblem !== null || sealProblem?.retryable === false) &&
                styles.sealButtonDisabled,
            ]}
          >
            {sealing ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.sealButtonLabel}>Seal capsule</Text>}
          </Pressable>
        </ScrollView>
      ) : null}
    </View>
  );
}

/** Paragraphs of the letter, as they will be read — mirrors `SealMovement.tsx`'s own `paragraphs()` exactly, operating on already-`envelopeToText`-flattened lines rather than raw TipTap JSON (mobile's own plain-text envelope, established by E1.4.3). */
function paragraphs(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0);
}

/** Matches `SealMovement.tsx`'s own glyph choice exactly: ♪ audio, ▤ video, ▣ everything else. */
function enclosureGlyph(kind: string): string {
  if (kind === 'audio' || kind === 'voice') return '♪';
  if (kind === 'video') return '▤';
  return '▣';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  back: { padding: space[4], alignSelf: 'flex-start' },
  backLabel: { fontSize: fontSize.body, color: colors.muted },
  content: { padding: space[4], paddingTop: 0, gap: space[6], paddingBottom: space[12] },
  heading: { fontSize: fontSize.bodyLarge, fontWeight: fontWeight.medium, color: colors.ink },
  record: {
    gap: space[3],
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.card,
    backgroundColor: colors.overlay,
    padding: space[4],
  },
  recordHallmark: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recordRule: { height: 1, backgroundColor: colors.rule },
  letterLines: { gap: space[3] },
  letterLine: { fontSize: fontSize.bodyLarge, lineHeight: fontSize.bodyLarge * 1.5, color: colors.ink },
  letterEmpty: { fontSize: fontSize.bodyLarge, color: colors.muted },
  enclosedList: { gap: space[1] },
  enclosedHeading: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.medium,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  enclosedItem: { fontSize: fontSize.caption, color: colors.muted },
  statusText: { fontSize: fontSize.body, color: colors.muted },
  irreversibility: {
    borderLeftWidth: 2,
    borderLeftColor: colors.rule,
    paddingLeft: space[4],
  },
  irreversibilityText: { fontSize: fontSize.body, color: colors.muted },
  alert: {
    gap: space[2],
    borderLeftWidth: 2,
    borderLeftColor: colors.danger,
    paddingLeft: space[4],
  },
  alertText: { fontSize: fontSize.body, color: colors.ink },
  alertAction: { fontSize: fontSize.body, color: colors.brass, textDecorationLine: 'underline' },
  sealButton: {
    backgroundColor: colors.brass,
    borderRadius: radius.input,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  sealButtonDisabled: { opacity: 0.5 },
  sealButtonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.onAccent },
});
