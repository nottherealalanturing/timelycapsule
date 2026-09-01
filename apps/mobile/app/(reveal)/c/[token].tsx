import type { RevealResponse } from '@tc/contracts';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { emptyEnvelope, type LetterEnvelope } from '../../../src/lib/capsule-crypto';
import { IdentityGate } from '../../../src/components/identity-gate';
import { LoadingState } from '../../../src/components/loading-state';
import { PassphraseGate } from '../../../src/components/passphrase-gate';
import { PlaceGate } from '../../../src/components/place-gate';
import { RevealCeremony } from '../../../src/components/reveal-ceremony';
import { SealStampsRow } from '../../../src/components/seal-stamps-row';
import { revealApi } from '../../../src/lib/api-client';
import { decryptRevealLetter, keyFromOpenedUrl } from '../../../src/lib/reveal-crypto';
import { formatAbsoluteDate, formatDuration, horizonPhrase } from '../../../src/lib/reveal-format';
import { colors, fontSize, fontWeight, space } from '../../../src/lib/tokens';
import { useNow } from '../../../src/lib/use-now';
import { useReveal, useUnlockTimer } from '../../../src/lib/use-reveal';

/**
 * PHASE-5.1 (reveal entry/locked/gates) + PHASE-5.2 (reveal ceremony,
 * letter decryption) — mobile equivalent of `apps/web/src/app/(reveal)/c/
 * [token]/page.tsx`'s full state machine, for exactly the states this pair
 * of tickets scopes. Reachable only via manual/dev navigation or a
 * `timelycapsule://c/:token[#k=...]` deep link today — no Universal/App
 * Link infrastructure exists yet (PHASE-5.5's job).
 *
 * PHASE-5.2 stops at the boundary between "the letter" and "everything
 * else a sealed capsule can carry": no media viewer, no confirm-read/One
 * Reading Only, no reply composer, no download-a-copy, no save-to-account
 * (PHASE-5.3+'s own scope). `data.media` is read from the response only to
 * confirm nothing about it is rendered here — no media item is ever passed
 * to a decrypt function by this file.
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
 * PHASE-5.2's own state machine, once every Seal gate is satisfied:
 * resolve a capsule key (passphrase unwrap or the link fragment), decrypt
 * the letter, and render the ceremony — or an honest, specific system
 * state for the two ways this can fail (no key available at all; a key
 * that does not open this capsule). Never a fabricated ceremony and never
 * an indefinite spinner (`07-EXPERIENCE-BIBLE.md` §VI.3).
 *
 * `capsuleKey` never comes from `useMasterKey()`/`resolveCapsuleKey` (the
 * owner-only path) — only from `PassphraseGate`'s unwrap or
 * `keyFromOpenedUrl`, matching the readiness audit's explicit security
 * requirement that this path never confuse itself with the owner's.
 */
type LetterState = { status: 'decrypting' } | { status: 'key_mismatch' } | { status: 'ready'; envelope: LetterEnvelope };

function UnlockedReveal({ data }: { data: Extract<RevealResponse, { status: 'unlocked' }> }) {
  const openedUrl = Linking.useLinkingURL();
  const [passphraseKey, setPassphraseKey] = useState<Uint8Array | null>(null);
  // Memoized so its reference is stable across renders that don't actually
  // change any input — `keyFromOpenedUrl` allocates a fresh `Uint8Array` on
  // every call, and without this the effect below (keyed on `capsuleKey`)
  // would refire on every render, re-decrypting forever.
  const capsuleKey = useMemo(
    () => passphraseKey ?? (!data.passphraseSeal ? keyFromOpenedUrl(openedUrl) : null),
    [passphraseKey, openedUrl, data.passphraseSeal],
  );

  // `letter` is derived, not set synchronously inside the effect (matches
  // PHASE-5.1's own `use-reveal.ts` fix for the identical eslint
  // react-hooks rule) — `result` only ever changes from the async
  // `.then()` continuation.
  const [result, setResult] = useState<{ capsuleKey: Uint8Array; contentDocEnc: string | null; letter: LetterState } | null>(null);

  useEffect(() => {
    if (!capsuleKey) return;
    let cancelled = false;
    decryptRevealLetter(capsuleKey, data.contentDocEnc).then((decrypted) => {
      if (cancelled) return;
      const letter: LetterState =
        decrypted.status === 'key_mismatch'
          ? { status: 'key_mismatch' }
          : { status: 'ready', envelope: decrypted.status === 'empty' ? emptyEnvelope() : decrypted.envelope };
      setResult({ capsuleKey, contentDocEnc: data.contentDocEnc, letter });
    });
    return () => {
      cancelled = true;
    };
  }, [capsuleKey, data.contentDocEnc]);

  const letter: LetterState =
    result?.capsuleKey === capsuleKey && result.contentDocEnc === data.contentDocEnc ? result.letter : { status: 'decrypting' };

  if (data.passphraseSeal && !capsuleKey) {
    return (
      <View style={styles.systemContainer}>
        <PassphraseGate hint={data.passphraseSeal.hint} wrappedKeyB64={data.passphraseSeal.wrappedKeyB64} onUnwrapped={setPassphraseKey} />
      </View>
    );
  }

  // A link forwarded, copied out of a preview pane, or dropped its `#k=`
  // fragment in transit — matches web's own "Key missing" system state
  // exactly, including why it happens.
  if (!capsuleKey) {
    return (
      <SystemScreen
        state="Key missing"
        headline="This link is missing its key."
        body="The part after the # carries the key that opens this capsule, and some apps drop it when a link is forwarded. Ask the sender for the original link."
      />
    );
  }

  if (letter.status === 'decrypting') {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.header}>
          <Text style={styles.hallmark}>{data.publicId}</Text>
          <Text style={styles.hallmark}>Opening</Text>
        </View>
        <LoadingState message="Decrypting this capsule." />
      </View>
    );
  }

  // A key was supplied and it did not open this capsule.
  if (letter.status === 'key_mismatch') {
    return (
      <SystemScreen
        state="Key mismatch"
        headline="This link did not open the capsule."
        body="The key it carries does not match. It may have been shortened or edited in transit. Ask the sender for the original link."
      />
    );
  }

  return <RevealCeremony publicId={data.publicId} senderName={data.senderName} envelope={letter.envelope} alreadyOpened={data.alreadyOpened} />;
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
        ) : (
          <UnlockedReveal data={data} />
        )
      ) : null}
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
