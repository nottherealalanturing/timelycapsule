import type { RevealResponse } from '@tc/contracts';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IdentityGate } from '../../../src/components/identity-gate';
import { LoadingState } from '../../../src/components/loading-state';
import { PassphraseGate } from '../../../src/components/passphrase-gate';
import { PlaceGate } from '../../../src/components/place-gate';
import { SealStampsRow } from '../../../src/components/seal-stamps-row';
import { revealApi } from '../../../src/lib/api-client';
import { formatAbsoluteDate, formatDuration, horizonPhrase } from '../../../src/lib/reveal-format';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useNow } from '../../../src/lib/use-now';
import { useReveal, useUnlockTimer } from '../../../src/lib/use-reveal';

/**
 * PHASE-5.1 — Reveal entry, locked state, Seal gates
 * (plan/STAGE-E-MOBILE-V1-PHASE-5-READINESS-AUDIT.md §14, ticket
 * PHASE-5.1). Mobile equivalent of `apps/web/src/app/(reveal)/c/[token]/
 * page.tsx`'s state machine and `LockedWait` component, for exactly the
 * states and gates this ticket scopes — reachable only via manual/dev
 * navigation or a `timelycapsule://c/:token` deep link today (no
 * Universal/App Link infrastructure exists yet; that's PHASE-5.5's job,
 * not this one's).
 *
 * Deliberately stops at the boundary between "gate state" and "capsule
 * content": once every required Seal is satisfied, this screen renders a
 * plain, honest "capsule is open" placeholder rather than the transit
 * ceremony, letter, or media viewer (PHASE-5.2/5.3's own scope) — see
 * `Opened` below. No capsule content is ever fetched, decrypted, or
 * rendered by this file; `data.contentDocEnc`/`data.media` are read from
 * the response only to confirm a state, never passed to any decrypt
 * function.
 */
type PageState = 'loading' | 'not-found' | 'rate-limited' | 'locked' | 'unlocked' | 'withdrawn' | 'expired';

function SystemScreen({ state, headline, body, retryLabel, onRetry }: { state: string; headline: string; body: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <View style={styles.systemContainer}>
      <View style={styles.header}>
        <Text style={styles.hallmark}>TimelyCapsule</Text>
        <Text style={styles.hallmark}>{state}</Text>
      </View>
      <View style={styles.systemBody}>
        <Text style={styles.systemHeadline}>{headline}</Text>
        <Text style={styles.systemText}>{body}</Text>
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={retryLabel ?? 'Try again'} style={styles.retryButton}>
          <Text style={styles.retryLabel}>{retryLabel ?? 'Try again'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The locked/waiting screen. Ported for information content, not visual
 * fidelity — states the same facts web's `LockedWait` does (sender,
 * teaser, absolute unlock date, horizon phrase, elapsed+remaining,
 * conditions, remind-me), through plain text rather than a ported
 * `MeridianApproach`/`DualClock` visual instrument. `07-EXPERIENCE-BIBLE.md`
 * §V.4 requires state to be stated in text regardless, so this is a
 * legitimate lower-fidelity substitution for this ticket, not a fabricated
 * behavior — flagged explicitly in this ticket's own final report as a
 * disclosed simplification, not silently dropped.
 *
 * "Add to calendar" is not implemented — web's version is a browser-only
 * `.ics` data-URL download with no equivalent on this platform without a
 * new native dependency (`expo-calendar`) this ticket was not scoped to
 * add. Omitted rather than faked with an inert button.
 */
function LockedWait({
  token,
  data,
  onPlaceGate,
  onIdentityGate,
}: {
  token: string;
  data: Extract<RevealResponse, { status: 'locked' }>;
  onPlaceGate: (gateToken: string) => void;
  onIdentityGate: (gateToken: string) => void;
}) {
  const unlockDate = data.unlockAt ? new Date(data.unlockAt) : null;
  const now = useNow(unlockDate !== null);
  const remainingMs = unlockDate ? Math.max(0, unlockDate.getTime() - now) : null;
  const sealedMs = data.sealedAt ? new Date(data.sealedAt).getTime() : null;

  const [remindEnabled, setRemindEnabled] = useState(false);
  const [remindBusy, setRemindBusy] = useState(false);

  const placeSeal = data.seals.find((s) => s.type === 'place' && !s.satisfied);
  const identitySeal = data.seals.find((s) => s.type === 'identity' && !s.satisfied);

  return (
    <ScrollView contentContainerStyle={styles.lockedContent}>
      <View style={styles.header}>
        <Text style={styles.hallmark}>{data.publicId}</Text>
        <Text style={styles.hallmark}>Sealed</Text>
      </View>

      <View style={styles.lockedIntro}>
        <Text style={styles.lockedTitle}>{data.senderName} sealed this for you.</Text>
        {data.teaser ? <Text style={styles.systemText}>{data.teaser}</Text> : null}
      </View>

      {remainingMs !== null && unlockDate ? (
        <View style={styles.section} accessibilityLabel="The wait">
          <Text style={styles.systemText}>Sealed until {formatAbsoluteDate(unlockDate.toISOString())}</Text>
          <Text style={styles.caption}>{horizonPhrase(remainingMs)}</Text>
          <View style={styles.rule}>
            {sealedMs !== null ? (
              <View style={styles.dualClock} accessible accessibilityRole="text" accessibilityLabel={`Elapsed ${formatDuration(Math.max(0, now - sealedMs))}. Remaining ${formatDuration(remainingMs)}.`}>
                <View>
                  <Text style={styles.hallmark}>Elapsed</Text>
                  <Text style={styles.duration}>{formatDuration(Math.max(0, now - sealedMs))}</Text>
                </View>
                <View>
                  <Text style={styles.hallmark}>Remaining</Text>
                  <Text style={styles.duration}>{formatDuration(remainingMs)}</Text>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.hallmark}>Remaining</Text>
                <Text style={styles.duration}>{formatDuration(remainingMs)}</Text>
              </View>
            )}
          </View>
        </View>
      ) : data.unlockLocal ? (
        <View style={styles.section} accessibilityLabel="The wait">
          <Text style={styles.systemText}>Sealed until {formatAbsoluteDate(`${data.unlockLocal.date}T${data.unlockLocal.time}:00`)}</Text>
          <Text style={styles.caption}>Opens in your own timezone.</Text>
        </View>
      ) : null}

      <SealStampsRow seals={data.seals} passphraseUnlocked={false} />

      {placeSeal && placeSeal.type === 'place' ? (
        <PlaceGate token={token} name={placeSeal.name} radiusM={placeSeal.radiusM} onSatisfied={onPlaceGate} />
      ) : identitySeal ? (
        <IdentityGate token={token} onSatisfied={onIdentityGate} />
      ) : null}

      <View style={[styles.rule, styles.remindRow]}>
        <Pressable
          onPress={async () => {
            setRemindBusy(true);
            try {
              await revealApi.remind(token, !remindEnabled);
              setRemindEnabled((v) => !v);
            } finally {
              setRemindBusy(false);
            }
          }}
          disabled={remindBusy}
          accessibilityRole="button"
          accessibilityLabel={remindEnabled ? 'You will be told when it opens' : 'Tell me when it opens'}
          accessibilityState={{ busy: remindBusy, selected: remindEnabled }}
          style={styles.ghostButton}
        >
          <Text style={styles.ghostButtonLabel}>{remindEnabled ? 'You will be told when it opens' : 'Tell me when it opens'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * The boundary this ticket does not cross. A recipient who has satisfied
 * every gate this screen knows about sees an honest statement that the
 * capsule is open, not a fabricated ceremony or an indefinite spinner —
 * `07-EXPERIENCE-BIBLE.md` §VI.3 forbids a loading state that never
 * resolves, and inventing a placeholder ceremony would be worse.
 */
function Opened({ publicId }: { publicId: string }) {
  return (
    <View style={styles.systemContainer}>
      <View style={styles.header}>
        <Text style={styles.hallmark}>{publicId}</Text>
        <Text style={styles.hallmark}>Open</Text>
      </View>
      <View style={styles.systemBody}>
        <Text style={styles.systemHeadline}>This capsule is open.</Text>
        <Text style={styles.systemText}>The reveal itself opens in a later release. Nothing further is shown here yet.</Text>
      </View>
    </View>
  );
}

export default function RevealScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const [placeGate, setPlaceGate] = useState<string | null>(null);
  const [identityGate, setIdentityGate] = useState<string | null>(null);

  const { state, retry } = useReveal(token, { placeGate, identityGate });
  const data = state.status === 'ready' ? state.data : null;

  const handleUnlock = useCallback(() => retry(), [retry]);
  useUnlockTimer(data?.status === 'locked' ? data.unlockAt : null, handleUnlock);

  const pageState: PageState = state.status === 'loading' ? 'loading' : state.status === 'not-found' ? 'not-found' : state.status === 'rate-limited' ? 'rate-limited' : (data!.status as PageState);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {pageState === 'loading' ? <LoadingState message="Retrieving this capsule." /> : null}

      {pageState === 'not-found' ? (
        <SystemScreen state="Not found" headline="No capsule at this link." body="The link may be incomplete or mistyped. Ask the sender for the full one." />
      ) : null}

      {pageState === 'rate-limited' ? (
        <SystemScreen
          state="Paused"
          headline="Too many attempts."
          body="This link is being opened too often. Give it a minute, then try again — nothing has happened to the capsule."
          onRetry={retry}
        />
      ) : null}

      {pageState === 'withdrawn' ? (
        <SystemScreen state="Withdrawn" headline="This capsule was withdrawn." body="The sender withdrew it before it opened. Its contents were never shown." />
      ) : null}

      {pageState === 'expired' ? (
        <SystemScreen state="Expired" headline="This capsule has expired." body="It opened, and its contents were removed on the schedule the sender set." />
      ) : null}

      {pageState === 'locked' && data?.status === 'locked' ? (
        <LockedWait token={token} data={data} onPlaceGate={setPlaceGate} onIdentityGate={setIdentityGate} />
      ) : null}

      {pageState === 'unlocked' && data?.status === 'unlocked' ? (
        data.requireIdentityVerification && !data.identityVerified && !identityGate ? (
          <View style={styles.systemContainer}>
            <IdentityGate token={token} onSatisfied={setIdentityGate} />
          </View>
        ) : data.passphraseSeal ? (
          <PassphraseGateStep hint={data.passphraseSeal.hint} wrappedKeyB64={data.passphraseSeal.wrappedKeyB64} publicId={data.publicId} />
        ) : (
          <Opened publicId={data.publicId} />
        )
      ) : null}
    </View>
  );
}

/**
 * Wraps `PassphraseGate` so the capsule key it produces stays local to
 * this step and is never threaded any further — PHASE-5.1 must not decrypt
 * content, so once unwrapped, the screen has nothing left to do with the
 * key except prove the gate was satisfied.
 */
function PassphraseGateStep({ hint, wrappedKeyB64, publicId }: { hint: string; wrappedKeyB64: string; publicId: string }) {
  const [unwrapped, setUnwrapped] = useState(false);
  if (unwrapped) return <Opened publicId={publicId} />;
  return (
    <View style={styles.systemContainer}>
      <PassphraseGate hint={hint} wrappedKeyB64={wrappedKeyB64} onUnwrapped={() => setUnwrapped(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  systemContainer: { flex: 1, justifyContent: 'center', padding: space[6], gap: space[6] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  hallmark: { fontSize: fontSize.caption, fontWeight: fontWeight.semibold, color: colors.muted, textTransform: 'uppercase' },
  systemBody: { gap: space[3] },
  systemHeadline: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: colors.ink },
  systemText: { fontSize: fontSize.body, color: colors.muted },
  retryButton: {
    alignSelf: 'flex-start',
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  retryLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
  lockedContent: { padding: space[6], gap: space[8] },
  lockedIntro: { gap: space[3] },
  lockedTitle: { fontSize: fontSize.title, fontWeight: fontWeight.semibold, color: colors.ink },
  section: { gap: space[2] },
  caption: { fontSize: fontSize.caption, color: colors.muted },
  rule: { borderTopWidth: 1, borderTopColor: colors.rule, paddingTop: space[4] },
  dualClock: { flexDirection: 'row', gap: space[8] },
  duration: {
    fontSize: fontSize.title,
    fontWeight: fontWeight.semibold,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  remindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4] },
  ghostButton: { paddingVertical: space[2], paddingHorizontal: space[3] },
  ghostButtonLabel: { fontSize: fontSize.body, color: colors.muted },
});
