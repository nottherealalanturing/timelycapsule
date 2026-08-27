import { Redirect, Stack } from 'expo-router';
import { useAuth } from '../../src/lib/auth-context';

/**
 * Bounces an already-authenticated visitor away from the auth stack (e.g.
 * returning to /login via the back button after a successful login).
 * `authState === 'unknown'` renders nothing here — app/index.tsx is the
 * only place that shows the splash spinner, so a direct deep-link into
 * `/(auth)/login` before hydration resolves just waits one tick rather
 * than showing a second, redundant loading UI.
 */
export default function AuthLayout() {
  const { authState } = useAuth();

  if (authState === 'authenticated') {
    return <Redirect href="/(app)/(tabs)/home" />;
  }
  if (authState === 'unknown') {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
