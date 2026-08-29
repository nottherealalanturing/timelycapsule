import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ErrorState } from '../../../src/components/error-state';
import { LoadingState } from '../../../src/components/loading-state';
import { capsulesApi } from '../../../src/lib/api-client';
import { colors } from '../../../src/lib/tokens';

/**
 * The creation entry point: `POST /capsules {type:'personal'}` then
 * navigate straight to Address for the new draft — mirrors web's two-phase
 * creation (a bare create, with every other field arriving via later
 * `PATCH`es from the Address movement itself). `router.replace`, not
 * `push`: this transient screen has nothing worth returning to, so it must
 * not sit in the back-stack between Home and Address — back from Address
 * should land directly on Home.
 */
export default function NewCapsuleScreen() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    capsulesApi
      .create({ type: 'personal' })
      .then(({ capsule }) => {
        if (!cancelled) router.replace(`/(app)/compose/${capsule.id}/address`);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router, attempt]);

  return (
    <View style={styles.container}>
      {failed ? (
        <ErrorState
          message="We couldn't start a new capsule."
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <LoadingState message="Starting a new capsule…" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
});
