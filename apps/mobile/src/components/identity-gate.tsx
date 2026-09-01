import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiClientError, revealApi } from '../lib/api-client';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

/**
 * Identity Seal gate — mobile port of `apps/web/src/components/reveal/
 * IdentityGate.tsx`. Real OTP round-trip against the existing backend
 * (`POST /r/:token/verify/request`, `POST /r/:token/verify`) — no bypass,
 * no client-side shortcut; the 6-digit code and its rate limits are
 * entirely server-enforced (`apps/api/src/modules/reveal/service.ts`'s
 * `MAX_OTP_ATTEMPTS`/`OTP_TTL_MS`, and the router's own rate-limit
 * middleware). A native `TextInput` in place of web's `OtpInput` widget —
 * this app has no six-box OTP component yet, and building one is UI
 * polish this ticket doesn't need; the six-digit numeric field carries the
 * same information with the platform's own numeric keyboard.
 */
export function IdentityGate({ token, onSatisfied }: { token: string; onSatisfied: (gateToken: string) => void }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');

  async function requestCode() {
    setSending(true);
    setError(null);
    try {
      await revealApi.requestIdentityCode(token);
      setSent(true);
    } catch {
      setError('Could not send a code. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function verify(fullCode: string) {
    setVerifying(true);
    setError(null);
    try {
      const { gateToken } = await revealApi.verifyIdentity(token, fullCode);
      onSatisfied(gateToken);
    } catch (err) {
      setCode('');
      setError(err instanceof ApiClientError ? 'Wrong code — check your email and try again.' : 'Something went wrong.');
    } finally {
      setVerifying(false);
    }
  }

  function handleCodeChange(next: string) {
    const digits = next.replace(/[^0-9]/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.body}>Verify it&apos;s really you before this capsule opens.</Text>
      {!sent ? (
        <Pressable
          onPress={() => void requestCode()}
          disabled={sending}
          accessibilityRole="button"
          accessibilityLabel="Send me a code"
          accessibilityState={{ busy: sending, disabled: sending }}
          style={styles.button}
        >
          <Text style={styles.buttonLabel}>{sending ? 'Sending…' : 'Send me a code'}</Text>
        </Pressable>
      ) : (
        <>
          <Text style={styles.caption}>Enter the 6-digit code we just sent you.</Text>
          <TextInput
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            maxLength={6}
            editable={!verifying}
            placeholder="000000"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Verification code"
            accessibilityHint="6-digit code sent to your email"
            style={styles.input}
          />
          <Pressable
            onPress={() => void requestCode()}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Resend code"
            accessibilityState={{ busy: sending, disabled: sending }}
            style={styles.ghostButton}
          >
            <Text style={styles.ghostButtonLabel}>{sending ? 'Sending…' : 'Resend code'}</Text>
          </Pressable>
        </>
      )}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
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
  caption: { fontSize: fontSize.caption, color: colors.muted, textAlign: 'center' },
  input: {
    width: '100%',
    textAlign: 'center',
    letterSpacing: 4,
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 3,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    fontSize: fontSize.bodyLarge,
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
  buttonLabel: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
  ghostButton: { paddingVertical: space[1], paddingHorizontal: space[2] },
  ghostButtonLabel: { fontSize: fontSize.caption, color: colors.muted },
});
