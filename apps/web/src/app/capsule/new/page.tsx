'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { capsulesApi } from '../../../lib/api-client';

/**
 * Thin create-then-redirect page — creating the draft here (not inside the
 * full composer) keeps the window where a refresh could double-create a
 * capsule as small as possible: once redirected to /capsule/:id/edit, a
 * refresh re-fetches the existing draft instead of creating another one.
 * Forwards along the optional `recipientEmail`/`recipientPhone`/`recipientName`
 * params set by /people's birthday-upcoming "Start a capsule" CTA (T-16).
 */
function NewCapsuleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    (async () => {
      const { capsule } = await capsulesApi.create({ type: 'personal' });
      const qs = searchParams.toString();
      router.replace(`/capsule/${capsule.id}/edit${qs ? `?${qs}` : ''}`);
    })();
  }, [router, searchParams]);

  return null;
}

export default function NewCapsulePage() {
  return (
    <Suspense fallback={null}>
      <NewCapsuleInner />
    </Suspense>
  );
}
