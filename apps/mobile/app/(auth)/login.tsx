import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ApiClientError } from '../../src/lib/api-client';
import { useAuth } from '../../src/lib/auth-context';
import { useMasterKey } from '../../src/lib/master-key-context';
import { colors, radius, space } from '../../src/lib/tokens';

/**
 * Real login screen: authenticates, then (via useAuth().login) unwraps the
 * master key inline with the same password. Error messages are
 * intentionally generic about *why* auth failed (never "wrong password" vs
 * "no such account" — that's a user-enumeration leak the API itself
 * doesn't distinguish either) and never mention Argon2id, AES-GCM, wraps,
 * or any other crypto internal, per this task's explicit constraint.
 */
export default function LoginScreen() {
  const { login } = useAuth();
  const { masterKey } = useMasterKey();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyWarning, setKeyWarning] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setKeyWarning(false);
    try {
      const loggedInUser = await login({ email: email.trim(), password });
      if (loggedInUser.masterKeyWrap && !masterKey) {
        // Auth succeeded but the inline unwrap didn't produce a key (see
        // auth-context.tsx's login()) — surfacing this rather than
        // silently landing the user in a shell that can't decrypt
        // anything. Doesn't block navigation: the authenticated shell's
        // own MasterKeyGate is what actually re-prompts.
        setKeyWarning(true);
      }
      router.replace('/(app)/(tabs)/home');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'network_error') {
        setError('Could not reach the server. Check your connection and try again.');
      } else {
        setError('Incorrect email or password.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={styles.title} accessibilityRole="header">
          Log in
        </Text>

        <Text style={styles.label} nativeID="email-label">
          Email
        </Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          accessibilityLabelledBy="email-label"
          accessibilityLabel="Email"
          editable={!submitting}
        />

        <Text style={styles.label} nativeID="password-label">
          Password
        </Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          accessibilityLabelledBy="password-label"
          accessibilityLabel="Password"
          editable={!submitting}
          onSubmitEditing={onSubmit}
        />

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        {keyWarning ? (
          <Text style={styles.warning} accessibilityLiveRegion="polite">
            You&rsquo;re logged in, but your encryption key couldn&rsquo;t be unlocked. Some content may be unavailable.
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Log in"
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          {submitting ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Log in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.ground,
    justifyContent: 'center',
  },
  form: {
    paddingHorizontal: space[6],
    gap: space[3],
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: space[4],
  },
  label: {
    fontSize: 13,
    color: colors.muted,
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
  warning: {
    color: colors.brass,
    fontSize: 14,
  },
  button: {
    marginTop: space[4],
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
