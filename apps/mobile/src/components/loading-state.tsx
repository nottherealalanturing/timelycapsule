import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, space } from '../lib/tokens';

/**
 * Static, layout-stable loading placeholder — deliberately never a
 * spinner/shimmer as the sole loading affordance, matching the product's
 * explicit motion rule (design/07-EXPERIENCE-BIBLE.md §VI.3/§XVI: state is
 * stated in text, never carried by an indeterminate animation). This is
 * for a screen/list-level "fetching" state; a small in-button busy
 * indicator (e.g. login.tsx's submit button) is a different, narrower
 * affordance and isn't what this component is for.
 */
export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.container} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
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
  },
  message: {
    fontSize: fontSize.body,
    color: colors.muted,
  },
});
