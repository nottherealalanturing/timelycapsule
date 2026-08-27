import { StyleSheet, Text, View } from 'react-native';
import { colors, space } from '../../../src/lib/tokens';

/** Placeholder — notifications center is a later ticket (06 §5.12). */
export default function NotificationsTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Notifications
      </Text>
      <Text style={styles.body}>Nothing yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground, padding: space[6] },
  title: { fontSize: 20, fontWeight: '600', color: colors.ink, marginBottom: space[2] },
  body: { fontSize: 14, color: colors.muted },
});
