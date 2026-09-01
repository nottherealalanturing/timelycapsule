import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';
import { revealApi } from '../lib/api-client';

type Status = 'idle' | 'checking' | 'denied' | 'far' | 'error';

/**
 * Place Seal gate — mobile port of `apps/web/src/components/reveal/
 * PlaceGate.tsx`. Ceremony and intent, **not** a cryptographic boundary
 * (the readiness audit's own wording, carried over from
 * `06-FEATURE-ADDENDUM.md` §B): the backend does the actual distance
 * check server-side (haversine, `apps/api/src/modules/reveal/
 * service.ts`'s `placeCheck`); this component's only job is to ask for
 * location just-in-time (never on mount) and report what the server said.
 *
 * `expo-location` is new to this app (PHASE-5.1's first use) — imported
 * dynamically via a plain `await import` at call time so a screen that
 * never renders this gate (locked capsules with no Place seal) never pays
 * for the native module's own initialization.
 */
export function PlaceGate({
  token,
  name,
  radiusM,
  onSatisfied,
}: {
  token: string;
  name: string;
  radiusM: number;
  onSatisfied: (gateToken: string) => void;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);

  async function checkLocation() {
    setStatus('checking');
    try {
      const Location = await import('expo-location');
      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const result = await revealApi.placeCheck(token, { lat: position.coords.latitude, lng: position.coords.longitude });
      setDistanceM(result.distanceM);
      setBearingDeg(result.bearingDeg);
      if (result.withinRange && result.gateToken) {
        onSatisfied(result.gateToken);
      } else {
        setStatus('far');
      }
    } catch {
      // Distinct from 'far': a real failure (location fetch failed, or the
      // network request itself failed) carries no `distanceM` to report —
      // found on a real device during this ticket's own verification,
      // where an earlier version of this catch block set 'far' without a
      // distance and rendered nothing at all, a real, now-fixed generic
      // "no error message reachable" defect (matching E1.4.10's own DoD).
      setStatus('error');
    }
  }

  return (
    <View style={styles.container} accessible={false}>
      <Text style={styles.body}>
        This capsule opens near &ldquo;{name}&rdquo; ({(radiusM / 1000).toFixed(1)} km radius).
      </Text>

      {status === 'far' && distanceM !== null ? (
        <Text style={styles.error} accessibilityRole="alert">
          {`You're ${(distanceM / 1000).toFixed(1)} km away${bearingDeg !== null ? ` (bearing ${bearingDeg}°)` : ''}. Try again once you're closer.`}
        </Text>
      ) : null}

      {status === 'denied' ? (
        <Text style={styles.error} accessibilityRole="alert">
          We couldn&apos;t access your location. Check your device&apos;s location permission and try again.
        </Text>
      ) : null}

      {status === 'error' ? (
        <Text style={styles.error} accessibilityRole="alert">
          Something went wrong checking your location. Try again.
        </Text>
      ) : null}

      <Pressable
        onPress={() => void checkLocation()}
        disabled={status === 'checking'}
        accessibilityRole="button"
        accessibilityLabel="Check my location"
        accessibilityState={{ busy: status === 'checking', disabled: status === 'checking' }}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>{status === 'checking' ? 'Checking…' : 'Check my location'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: space[3],
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: space[4],
  },
  body: { fontSize: fontSize.body, color: colors.muted, textAlign: 'center' },
  error: { fontSize: fontSize.body, color: colors.danger, textAlign: 'center' },
  button: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  buttonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
});
