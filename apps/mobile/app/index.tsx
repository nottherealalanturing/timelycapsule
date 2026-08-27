import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../src/lib/auth-context';
import { colors } from '../src/lib/tokens';

/**
 * The three-state hydration gate. While `authState === 'unknown'` (the
 * SecureStore read hasn't resolved yet), render a splash spinner and
 * nothing else — redirecting before the real answer is known would flash
 * the wrong screen for an already-logged-in user, exactly the hydration
 * race this ticket's success criterion rules out.
 */
export default function Index() {
  const { authState } = useAuth();

  if (authState === 'unknown') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.brass} />
      </View>
    );
  }

  return <Redirect href={authState === 'authenticated' ? '/(app)/(tabs)/home' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ground,
  },
});
