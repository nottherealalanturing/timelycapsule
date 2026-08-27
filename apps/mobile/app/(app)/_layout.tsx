import { Redirect, Slot } from 'expo-router';
import { useAuth } from '../../src/lib/auth-context';
import { MasterKeyGate } from '../../src/components/master-key-gate';

/**
 * Route guard for the entire authenticated group. `authState === 'unknown'`
 * renders nothing — app/index.tsx already owns the splash spinner for that
 * window; a direct deep-link straight into `/(app)/...` before hydration
 * resolves just waits one tick instead of flashing a second loading UI.
 */
export default function AppLayout() {
  const { authState } = useAuth();

  if (authState === 'unauthenticated') {
    return <Redirect href="/(auth)/login" />;
  }
  if (authState === 'unknown') {
    return null;
  }

  return (
    <MasterKeyGate>
      <Slot />
    </MasterKeyGate>
  );
}
