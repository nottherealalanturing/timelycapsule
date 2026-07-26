'use client';

import { use } from 'react';
import { MasterKeyGate } from '../../../../components/MasterKeyGate';
import { Composer } from '../../../../components/composer/Composer';

export default function EditCapsulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <MasterKeyGate>
      <Composer capsuleId={id} />
    </MasterKeyGate>
  );
}
