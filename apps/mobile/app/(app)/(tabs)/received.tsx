import { StyleSheet, Text, View } from 'react-native';
import { colors, space } from '../../../src/lib/tokens';

/** Placeholder — recipient inbox is a later ticket (06 §5.8). */
export default function ReceivedTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Received
      </Text>
      <Text style={styles.body}>Capsules sent to you will show up here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground, padding: space[6] },
  title: { fontSize: 20, fontWeight: '600', color: colors.ink, marginBottom: space[2] },
  body: { fontSize: 14, color: colors.muted },
});
