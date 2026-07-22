import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { countdownParts } from '@tc/core';

// Placeholder screen — real navigation/screens are built in T-23 onward
// per plan/05-BUILD-PLAYBOOK.md. This proves @tc/core is wired through
// the workspace into the native app.
const DEMO_TARGET = new Date('2027-06-01T09:00:00Z');

export default function App() {
  const countdown = countdownParts(DEMO_TARGET, new Date('2026-01-01T00:00:00Z'));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TimelyCapsule</Text>
      <Text>
        Monorepo scaffold online. Demo countdown ({countdown.granularity}):{' '}
        {countdown.years !== undefined
          ? `${countdown.years}y ${countdown.months}m`
          : JSON.stringify(countdown)}
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
});
