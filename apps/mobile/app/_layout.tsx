import { Slot } from 'expo-router';
import { AuthProvider } from '../src/lib/auth-context';
import { MasterKeyProvider } from '../src/lib/master-key-context';

/**
 * Root layout — providers only, no navigation logic of its own. The actual
 * routing decision (which stack a visitor sees) lives in app/index.tsx and
 * app/(app)/_layout.tsx, each reading `useAuth()` from these providers.
 *
 * MasterKeyProvider wraps AuthProvider (not the other way around) because
 * AuthProvider's login()/logout() call useMasterKey() internally.
 *
 * Deliberately no deep-link URL capture here — E0.2 proved fragment
 * survival for a future reveal route, but no route in this ticket consumes
 * a captured URL, so wiring one here would be dead code. That belongs with
 * whichever ticket ships the reveal screen.
 */
export default function RootLayout() {
  return (
    <MasterKeyProvider>
      <AuthProvider>
        <Slot />
      </AuthProvider>
    </MasterKeyProvider>
  );
}
