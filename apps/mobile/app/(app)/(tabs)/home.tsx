import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../../src/lib/auth-context';
import { colors, space } from '../../../src/lib/tokens';

/** Placeholder — capsule dashboard is a later ticket (06 §5.4). */
export default function HomeTab() {
  const { user } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Welcome{user ? `, ${user.displayName}` : ''}
      </Text>
      <Text style={styles.body}>Your capsules will show up here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground, padding: space[6] },
  title: { fontSize: 20, fontWeight: '600', color: colors.ink, marginBottom: space[2] },
  body: { fontSize: 14, color: colors.muted },
});
