import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

/**
 * `message` must always be a plain, pre-sanitized string chosen by the
 * caller — never a raw `Error`/`ApiClientError`/crypto-failure object.
 * This component has no knowledge of API or crypto internals, so it
 * cannot leak them; screens are responsible for translating whatever
 * they caught into copy that's safe to show a recipient.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.message}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}>
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[6],
    backgroundColor: colors.ground,
    gap: space[4],
  },
  message: {
    fontSize: fontSize.body,
    color: colors.danger,
    textAlign: 'center',
  },
  retry: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  retryLabel: {
    fontSize: fontSize.body,
    fontWeight: fontWeight.medium,
    color: colors.ink,
  },
});
