'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { capsulesApi } from '../../../lib/api-client';

/**
 * Thin create-then-redirect page — creating the draft here (not inside the
 * full composer) keeps the window where a refresh could double-create a
 * capsule as small as possible: once redirected to /capsule/:id/edit, a
 * refresh re-fetches the existing draft instead of creating another one.
 */
export default function NewCapsulePage() {
  const router = useRouter();
  const createdRef = useRef(false);

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    (async () => {
      const { capsule } = await capsulesApi.create({ type: 'personal' });
      router.replace(`/capsule/${capsule.id}/edit`);
    })();
  }, [router]);

  return null;
}
