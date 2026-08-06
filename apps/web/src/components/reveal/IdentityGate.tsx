'use client';

import { OtpInput, Button } from '@tc/ui-web';
import { useState } from 'react';
import { revealApi, ApiClientError } from '../../lib/api-client';

export function IdentityGate({ token, onSatisfied }: { token: string; onSatisfied: (gateToken: string) => void }) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');

  async function requestCode() {
    setSending(true);
    setError(null);
    try {
      await revealApi.requestIdentityCode(token);
      setSent(true);
    } catch {
      setError('Could not send a code. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function verify(fullCode: string) {
    setVerifying(true);
    setError(null);
    try {
      const { gateToken } = await revealApi.verifyIdentity(token, fullCode);
      onSatisfied(gateToken);
    } catch (err) {
      setCode('');
      setError(err instanceof ApiClientError ? 'Wrong code — check your email and try again.' : 'Something went wrong.');
    } finally {
      setVerifying(false);
    }
  }

  function handleCodeChange(next: string) {
    setCode(next);
    if (next.length === 6) void verify(next);
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-rule)] p-6 text-center">
      <p className="text-[length:var(--text-body-s)] text-secondary">Verify it&apos;s really you before this capsule opens.</p>
      {!sent ? (
        <Button onClick={() => void requestCode()} loading={sending}>
          Send me a code
        </Button>
      ) : (
        <>
          <p className="text-[length:var(--text-caption)] text-secondary">Enter the 6-digit code we just sent you.</p>
          <OtpInput length={6} value={code} onChange={handleCodeChange} disabled={verifying} />
          <Button variant="ghost" size="sm" onClick={() => void requestCode()} loading={sending}>
            Resend code
          </Button>
        </>
      )}
      {error ? <p className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
