import { unwrapCapsuleKeyWithPassphrase } from '@tc/crypto';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

const THROTTLE_STEPS_MS = [0, 1000, 2000, 4000, 8000];

/**
 * Passphrase Seal gate — mobile port of `apps/web/src/components/reveal/
 * PassphraseGate.tsx`, same `@tc/crypto` primitive, same client-only
 * throttle (no server oracle — wrong attempts fail entirely client-side,
 * per `06-FEATURE-ADDENDUM.md` §B). PHASE-5.1 stops here: `onUnwrapped`
 * hands the caller a raw capsule key and this component's job ends —
 * decrypting anything with it is PHASE-5.2's job, not this one's.
 *
 * The passphrase itself is local component state only; it is never logged,
 * never sent to the server (this component makes no network call at all —
 * `unwrapCapsuleKeyWithPassphrase` is pure, local AES unwrap), and is
 * discarded the moment this component unmounts.
 */
export function PassphraseGate({
  hint,
  wrappedKeyB64,
  onUnwrapped,
}: {
  hint: string;
  wrappedKeyB64: string;
  onUnwrapped: (capsuleKey: Uint8Array) => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const delay = THROTTLE_STEPS_MS[Math.min(attempts, THROTTLE_STEPS_MS.length - 1)]!;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const key = await unwrapCapsuleKeyWithPassphrase(wrappedKeyB64, passphrase);
      onUnwrapped(key);
    } catch {
      setAttempts((n) => n + 1);
      setError("That passphrase didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.body}>This capsule needs a passphrase to open.</Text>
      <Text style={styles.hint}>Hint: {hint}</Text>
      <TextInput
        value={passphrase}
        onChangeText={setPassphrase}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Passphrase"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Passphrase"
        onSubmitEditing={() => void submit()}
        style={styles.input}
      />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={() => void submit()}
        disabled={busy || !passphrase}
        accessibilityRole="button"
        accessibilityLabel="Unlock"
        accessibilityState={{ busy, disabled: busy || !passphrase }}
        style={[styles.button, (busy || !passphrase) && styles.buttonDisabled]}
      >
        <Text style={styles.buttonLabel}>{busy ? 'Unlocking…' : 'Unlock'}</Text>
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
  hint: { fontSize: fontSize.caption, color: colors.muted, textAlign: 'center' },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 3,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    fontSize: fontSize.body,
    color: colors.ink,
  },
  error: { fontSize: fontSize.body, color: colors.danger, textAlign: 'center' },
  button: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
});
