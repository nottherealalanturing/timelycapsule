'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';
import { MasterKeyGate } from '../../../../components/MasterKeyGate';
import { Composer } from '../../../../components/composer/Composer';

/**
 * Reads the optional `recipientEmail`/`recipientPhone`/`recipientName`
 * query params set by /people's "Start a capsule" birthday CTA (T-16).
 * `useSearchParams` needs its own Suspense boundary for static export
 * prerendering (same requirement hit in T-15b's signup page).
 */
function EditCapsuleInner({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const email = searchParams.get('recipientEmail') ?? undefined;
  const phone = searchParams.get('recipientPhone') ?? undefined;
  const displayName = searchParams.get('recipientName') ?? undefined;
  const initialRecipient = email || phone ? { email, phone, displayName } : undefined;

  return <Composer capsuleId={id} initialRecipient={initialRecipient} />;
}

export default function EditCapsulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <MasterKeyGate>
      <Suspense fallback={null}>
        <EditCapsuleInner id={id} />
      </Suspense>
    </MasterKeyGate>
  );
}
