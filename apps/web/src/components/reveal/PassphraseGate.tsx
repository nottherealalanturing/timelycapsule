'use client';

import { unwrapCapsuleKeyWithPassphrase } from '@tc/crypto';
import { Button, Input } from '@tc/ui-web';
import { useState } from 'react';

const THROTTLE_STEPS_MS = [0, 1000, 2000, 4000, 8000];

/**
 * Passphrase Seal — wrong attempts fail entirely client-side (no server
 * oracle, per 06-FEATURE-ADDENDUM.md §B); a soft, client-only throttle
 * discourages rapid guessing without any server round-trip to rate-limit.
 */
export function PassphraseGate({
  hint,
  wrappedKeyB64,
  onUnwrapped,
}: {
  hint: string;
  wrappedKeyB64: string;
  onUnwrapped: (capsuleKey: Uint8Array) => void;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const delay = THROTTLE_STEPS_MS[Math.min(attempts, THROTTLE_STEPS_MS.length - 1)]!;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const key = await unwrapCapsuleKeyWithPassphrase(wrappedKeyB64, passphrase);
      onUnwrapped(key);
    } catch {
      setAttempts((n) => n + 1);
      setError("That passphrase didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 p-6 text-center">
      <p className="text-sm text-secondary">This capsule needs a passphrase to open.</p>
      <p className="text-xs text-secondary">Hint: {hint}</p>
      <Input
        type="password"
        label="Passphrase"
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
      />
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <Button onClick={() => void submit()} loading={busy} disabled={!passphrase}>
        Unlock
      </Button>
    </div>
  );
}
