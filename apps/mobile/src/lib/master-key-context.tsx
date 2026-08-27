import { unwrapMasterKeyWithPassword } from '@tc/crypto';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * Verbatim port of apps/web/src/lib/master-key-context.tsx — this logic has
 * no DOM/storage dependency (pure React state + @tc/crypto), so nothing
 * platform-specific needed to change. Same rule applies here as on web: the
 * master key lives in memory only, never in SecureStore/AsyncStorage, and
 * is lost on process restart by design — MasterKeyGate (screens layer) is
 * what re-prompts for the password when that happens.
 */
interface MasterKeyContextValue {
  masterKey: Uint8Array | null;
  setMasterKey: (key: Uint8Array | null) => void;
  clearMasterKey: () => void;
  /** Unwraps `masterKeyWrap` (from the current user, base64) with the given password and stores the result in memory. Throws if the password is wrong (AES-GCM auth failure) or masterKeyWrap is null. */
  unlockWithPassword: (masterKeyWrap: string | null, password: string) => Promise<Uint8Array>;
}

const MasterKeyContext = createContext<MasterKeyContextValue | null>(null);

export function MasterKeyProvider({ children }: { children: ReactNode }) {
  const [masterKey, setMasterKeyState] = useState<Uint8Array | null>(null);
  const keyRef = useRef<Uint8Array | null>(null);

  const setMasterKey = useCallback((key: Uint8Array | null) => {
    keyRef.current = key;
    setMasterKeyState(key);
  }, []);

  const clearMasterKey = useCallback(() => {
    keyRef.current = null;
    setMasterKeyState(null);
  }, []);

  const unlockWithPassword = useCallback(
    async (masterKeyWrap: string | null, password: string) => {
      if (!masterKeyWrap) {
        throw new Error('This account has no encryption key to unlock. Set a password in Settings first.');
      }
      const key = await unwrapMasterKeyWithPassword(masterKeyWrap, password);
      setMasterKey(key);
      return key;
    },
    [setMasterKey],
  );

  const value = useMemo(
    () => ({ masterKey, setMasterKey, clearMasterKey, unlockWithPassword }),
    [masterKey, setMasterKey, clearMasterKey, unlockWithPassword],
  );

  return <MasterKeyContext.Provider value={value}>{children}</MasterKeyContext.Provider>;
}

export function useMasterKey(): MasterKeyContextValue {
  const ctx = useContext(MasterKeyContext);
  if (!ctx) {
    throw new Error('useMasterKey must be used within a MasterKeyProvider');
  }
  return ctx;
}
