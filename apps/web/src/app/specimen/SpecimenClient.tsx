'use client';

import { useState } from 'react';
import { Button, Checkbox, Dialog, Input, OtpInput, PasswordStrengthMeter } from '@tc/ui-web';
import { RecoveryKit } from '../../components/RecoveryKit';
import { AppSidebar } from '../../components/AppSidebar';
import { DashboardFilters } from '../../components/dashboard/DashboardFilters';
import { CapsuleTimelineRow } from '../../components/dashboard/CapsuleTimelineRow';
import { SealCeremony } from '../../components/composer/SealCeremony';

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

/**
 * The application shell, staged.
 *
 * Must live in a client component: a server component cannot pass event
 * handlers across the boundary, and `AppSidebar` takes `onSearch`/`onLogout`.
 * The real `(app)/layout.tsx` is already `'use client'`, so this constraint is
 * specific to the specimen.
 */
export function AuthStage() {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="flex max-w-[440px] flex-col gap-5">
      <RecoveryKit code="K7M2-9QXA-4TFP-3WVN" />
      <Checkbox
        checked={agreed}
        onChange={(e) => setAgreed(e.target.checked)}
        label="I've saved this recovery code somewhere safe."
      />
      <Checkbox checked readOnly label="Checked state" />
      <Checkbox disabled label="Disabled" />
    </div>
  );
}

export function DashboardStage() {
  const [view, setView] = useState<'timeline' | 'grid'>('timeline');
  const [fav, setFav] = useState(false);
  const [state, setState] = useState<undefined | 'draft' | 'sealed'>(undefined);
  return (
    <div className="flex flex-col gap-5">
      <DashboardFilters
        stateFilter={state}
        typeFilter={undefined}
        tagFilter={undefined}
        favoriteOnly={fav}
        view={view}
        tags={[{ id: 't1', name: 'family' }]}
        onState={(v) => setState(v as undefined | 'draft' | 'sealed')}
        onType={() => {}}
        onTag={() => {}}
        onFavorite={() => setFav((v) => !v)}
        onView={setView}
      />
      <div className="flex flex-col gap-2">
        <CapsuleTimelineRow capsule={FIXTURE_CAPSULE} />
        <CapsuleTimelineRow capsule={{ ...FIXTURE_CAPSULE, id: 'x2', state: 'draft', title: 'Untitled capsule', sealedAt: null } as typeof FIXTURE_CAPSULE} />
      </div>
    </div>
  );
}

export function CeremonyStage() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        onClick={() => {
          setLog((l) => [...l, `opened ${new Date().toISOString().slice(14, 23)}`]);
          setOpen(true);
        }}
      >
        Run seal ceremony
      </Button>
      <p className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] text-secondary">
        {log.length ? log.join(' · ') : 'approach 900ms linear → hold 400ms dead stop → instant. Click or press Esc to skip.'}
      </p>
      <SealCeremony
        open={open}
        onDone={() => {
          setLog((l) => [...l, `done ${new Date().toISOString().slice(14, 23)}`]);
          setOpen(false);
        }}
      />
    </div>
  );
}

export function ShellStage() {
  return (
    <div className="flex h-[420px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule)]">
      <AppSidebar displayName="Michael Adeyemi" pathname="/home" onSearch={() => {}} onLogout={() => {}} />
      <div className="flex-1 bg-[var(--color-bg-primary)]" />
    </div>
  );
}

/* ── Composite staging ────────────────────────────────────────────────
   Composite components live behind auth, so they are staged here with
   fixture data to get honest before/after captures during the rebuild. */
export const FIXTURE_CAPSULE = {
  id: '00000000-0000-4000-8000-000000000001',
  publicId: 'TC-84KZQM3P',
  ownerId: '00000000-0000-4000-8000-000000000002',
  type: 'standard',
  state: 'sealed',
  title: 'Letter to my daughter',
  cover: { kind: 'gradient', value: 'linear-gradient(135deg,#1C2230,#0B0E14)' },
  teaser: null,
  passphraseHint: null,
  sizeBytes: 0,
  unlockMode: 'absolute',
  unlockAt: new Date(Date.now() + 12.1 * 365.25 * 864e5).toISOString(),
  unlockLocal: null,
  sealDeadlineAt: null,
  sealedAt: new Date(Date.now() - 2.92 * 365.25 * 864e5).toISOString(),
  extendedOnce: false,
  seals: [],
  allowDownload: true,
  recipientsVisible: true,
  announceOnSeal: false,
  requireRecipientVerification: false,
  replyPrompt: null,
  location: null,
  expiresAfter: null,
  expiryStrict: false,
  expiredAt: null,
  archivedAt: null,
  trashedAt: null,
  purgeAfter: null,
  withdrawnAt: null,
  legacyConfig: null,
  recurrence: null,
  breakGlass: 'disabled',
  isFavorite: true,
  tagIds: [],
  createdAt: new Date(Date.now() - 3 * 365.25 * 864e5).toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as import('@tc/contracts').CapsuleListItem;
