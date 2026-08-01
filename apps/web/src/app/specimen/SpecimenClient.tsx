'use client';

import { useState } from 'react';
import { Button, Dialog, Input, OtpInput, PasswordStrengthMeter } from '@tc/ui-web';

/** Interactive half of the primitive specimen (dev only). */
export function SpecimenClient() {
  const [password, setPassword] = useState('correct horse battery');
  const [otp, setOtp] = useState('4821');
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-[560px] gap-4 sm:grid-cols-2">
        <Input label="Email" defaultValue="amara@example.com" />
        <Input label="Recipient" placeholder="Who is this for?" hint="They need no account." />
        <Input label="Unlock date" defaultValue="2041-03-14" />
        <Input label="Passphrase" error="That does not match." defaultValue="hunter2" />
      </div>

      <div className="flex max-w-[420px] flex-col gap-2">
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[length:var(--text-body-s)] font-medium">Verification code</span>
        <OtpInput value={otp} onChange={setOtp} />
      </div>

      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open dialog
        </Button>
        <Dialog
          open={open}
          onOpenChange={setOpen}
          title="Seal this capsule?"
          description="Sealing is permanent. The contents cannot be changed afterwards, only destroyed."
        >
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button onClick={() => setOpen(false)}>Seal</Button>
          </div>
        </Dialog>
      </div>
    </div>
  );
}
