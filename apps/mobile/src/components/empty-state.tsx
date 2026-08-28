import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, space } from '../lib/tokens';

/**
 * Static "nothing here yet" placeholder. `title` is the required, always-
 * shown line; `message` is an optional second line for screens that want
 * to say more (matching web's per-screen empty-state copy pattern — e.g.
 * "Nothing sealed yet" — rather than one generic string reused everywhere).
 */
export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
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
    gap: space[2],
  },
  title: {
    fontSize: fontSize.bodyLarge,
    fontWeight: fontWeight.medium,
    color: colors.ink,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.body,
    color: colors.muted,
    textAlign: 'center',
  },
});
