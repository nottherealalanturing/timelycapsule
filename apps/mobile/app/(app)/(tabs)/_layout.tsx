import { Tabs } from 'expo-router';
import { colors } from '../../../src/lib/tokens';

/**
 * Four tabs, matching plan/02-UX-DESIGN.md §"Navigation" (bottom tabs —
 * Home · Received · [FAB: New] · Notifications · Profile). The "New
 * capsule" FAB is a modal action, not a tab route, and capsule
 * creation/browsing itself is out of this ticket's scope — these are
 * placeholder screens establishing the shell a later ticket fills in.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brass,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.overlay, borderTopColor: colors.rule },
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="received" options={{ title: 'Received' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
