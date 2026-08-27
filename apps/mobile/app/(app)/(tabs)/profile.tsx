import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../../src/lib/auth-context';
import { colors, radius, space } from '../../../src/lib/tokens';

/**
 * Placeholder profile screen — the full settings surface (06's Panels) is
 * a later ticket. This ticket's actual requirement lives here: a real
 * logout path. Note has no router.replace() call after logout — the
 * (app)/_layout.tsx guard already redirects to /login the moment
 * authState flips to 'unauthenticated', so navigating here too would race
 * it.
 */
export default function ProfileTab() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Profile
      </Text>
      {user ? <Text style={styles.email}>{user.email}</Text> : null}
      <TouchableOpacity
        style={[styles.button, loggingOut && styles.buttonDisabled]}
        onPress={onLogout}
        disabled={loggingOut}
        accessibilityRole="button"
        accessibilityLabel="Log out"
        accessibilityState={{ disabled: loggingOut, busy: loggingOut }}
      >
        {loggingOut ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.buttonText}>Log out</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground, padding: space[6] },
  title: { fontSize: 20, fontWeight: '600', color: colors.ink, marginBottom: space[2] },
  email: { fontSize: 14, color: colors.muted, marginBottom: space[8] },
  button: {
    backgroundColor: colors.danger,
    borderRadius: radius.input,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onAccent, fontSize: 16, fontWeight: '600' },
});
