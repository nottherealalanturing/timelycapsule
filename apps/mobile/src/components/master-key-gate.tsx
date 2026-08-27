import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../lib/auth-context';
import { useMasterKey } from '../lib/master-key-context';
import { colors, radius, space } from '../lib/tokens';

/**
 * Covers the "authenticated but no key in memory" case: a valid session
 * was restored from SecureStore (e.g. app relaunch after being fully
 * killed) but the master key — deliberately in-memory-only, never
 * persisted — is gone. Mirrors web's MasterKeyGate: re-prompt for the
 * password rather than treat this as logged out.
 *
 * Renders nothing (blocks children) for a user with no masterKeyWrap at
 * all (no password set) — there's nothing to unlock, so children render
 * straight through.
 */
export function MasterKeyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { masterKey, unlockWithPassword } = useMasterKey();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.masterKeyWrap || masterKey) {
    return <>{children}</>;
  }

  const onSubmit = async () => {
    if (!password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await unlockWithPassword(user.masterKeyWrap, password);
    } catch {
      setError('Incorrect password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Unlock your content
      </Text>
      <Text style={styles.subtitle}>Enter your password to unlock your encrypted content on this device.</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        accessibilityLabel="Password"
        editable={!submitting}
        onSubmitEditing={onSubmit}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.button, (!password || submitting) && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={!password || submitting}
        accessibilityRole="button"
        accessibilityLabel="Unlock"
        accessibilityState={{ disabled: !password || submitting, busy: submitting }}
      >
        {submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Unlock</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ground,
    justifyContent: 'center',
    paddingHorizontal: space[6],
    gap: space[3],
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: space[3],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: radius.input,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.overlay,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
  button: {
    marginTop: space[3],
    backgroundColor: colors.brass,
    borderRadius: radius.input,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '600',
  },
});
