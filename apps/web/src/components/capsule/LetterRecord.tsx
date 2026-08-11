'use client';

import type { Capsule } from '@tc/contracts';
import { decryptBytes, unwrapCapsuleKeyForOwner } from '@tc/crypto';
import { Button, Record } from '@tc/ui-web';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { mediaApi } from '../../lib/api-client';
import { decryptEnclosure } from '../../lib/enclosure-media';
import { EnclosureViewer } from '../enclosure/EnclosureViewer';
import { decodeIvCiphertext } from '../../lib/capsule-crypto';
import { envelopeText } from '../../lib/letter-envelope';
import { useMasterKey } from '../../lib/master-key-context';
import { MasterKeyGate } from '../MasterKeyGate';

/**
 * Reads both the V2 letter envelope and the bare document older capsules
 * hold — an owner must never meet a blank screen because the shape changed
 * after their capsule was sealed.
 */
const renderDoc = envelopeText;

/**
 * The letter, on paper, as the thing the page is about.
 *
 * It used to live behind a "Contents" tab, in a bordered box in the
 * instrument register, three clicks of equal weight from "Activity". That is
 * a database record with a text column. The letter is the object in custody,
 * so it takes the record register (`05`) and it is the first thing on the
 * page after the reading of the wait.
 *
 * The record is always present, and what it holds depends on where the
 * capsule is:
 *
 *   - **Withheld** while a capsule to yourself is still sealed. Not an error
 *     and not an empty state — the withholding *is* the product, so the sheet
 *     is there and states plainly why it is blank.
 *   - **Closed** when the master key is not in memory. The key is never
 *     persisted (zero-access), so this is the ordinary case after a refresh.
 *     Reading is an action the owner takes rather than a password prompt
 *     thrown at them on load.
 *   - **Open** — the letter, and whatever travels with it.
 */
export function LetterRecord({ capsule }: { capsule: Capsule }) {
  const { masterKey } = useMasterKey();
  const [unlocking, setUnlocking] = useState(false);

  // `07 §V.6` — a capsule to yourself keeps its own secret until it opens.
  const withheld = capsule.type === 'self' && capsule.state === 'sealed';

  if (withheld) {
    return (
      <RecordBed>
        <Record as="article">
          <p className="text-[var(--color-text-secondary)]">
            Sealed to yourself. What is inside stays unread until it opens — that is the whole of what you asked
            for.
          </p>
        </Record>
      </RecordBed>
    );
  }

  if (!masterKey && !unlocking) {
    return (
      <RecordBed>
        <Record as="article" className="flex flex-col items-start gap-4">
          <p className="text-[var(--color-text-secondary)]">
            Closed. Your password unwraps the key that opens this — we never hold it, so it is asked for again
            after every refresh.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setUnlocking(true)}>
            Read it
          </Button>
        </Record>
      </RecordBed>
    );
  }

  return (
    <MasterKeyGate>
      <OpenLetter capsule={capsule} />
    </MasterKeyGate>
  );
}

/**
 * The instrument ground the record lies on. Gate 1's first rule — a record is
 * an object, never a background — so the surround stays visible on all four
 * sides at every breakpoint.
 */
function RecordBed({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius-record)] bg-[var(--color-bg-primary)] p-3 sm:p-5">{children}</div>;
}

function OpenLetter({ capsule }: { capsule: Capsule }) {
  const { masterKey } = useMasterKey();

  const { data: media = [] } = useQuery({
    queryKey: ['media', capsule.id],
    queryFn: async () => (await mediaApi.list(capsule.id)).data,
  });

  const { data: letter, isLoading } = useQuery({
    queryKey: ['capsule-contents', capsule.id],
    queryFn: async () => {
      if (!capsule.contentDocEnc || !capsule.ownerKeyWrap || !masterKey) return null;
      const capsuleKey = await unwrapCapsuleKeyForOwner(capsule.ownerKeyWrap, masterKey);
      const { iv, ciphertext } = decodeIvCiphertext(capsule.contentDocEnc);
      const plaintext = await decryptBytes(capsuleKey, iv, ciphertext);
      return renderDoc(JSON.parse(new TextDecoder().decode(plaintext)));
    },
    enabled: Boolean(masterKey),
  });

  const paragraphs = (letter ?? '').split('\n').filter((line) => line.trim().length > 0);

  return (
    <RecordBed>
      <Record as="article" className="flex flex-col gap-6">
        {isLoading ? (
          // No shimmer, no spinner (`07 §XVI`) — a held line that states what
          // is happening once, in the register it is happening on.
          <p className="text-[var(--color-text-secondary)]">Opening.</p>
        ) : paragraphs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {paragraphs.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="text-[var(--color-text-secondary)]">Nothing was written.</p>
        )}

        {media.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-[var(--color-rule)] pt-5">
            <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.14em] text-[var(--color-text-secondary)]">
              Enclosed
            </span>
            {/* The same viewer the recipient gets. The owner used to open an
                enclosure in a new browser tab — which is to say, outside the
                letter it belongs to, in a window the product does not own. */}
            {media.map((item) => (
              <EnclosureViewer
                key={item.id}
                enclosure={item}
                allowDownload={capsule.allowDownload}
                load={async () => {
                  if (!masterKey || !capsule.ownerKeyWrap) throw new Error('Capsule is locked');
                  const capsuleKey = await unwrapCapsuleKeyForOwner(capsule.ownerKeyWrap, masterKey);
                  const { url } = await mediaApi.view(item.id);
                  return decryptEnclosure(url, capsuleKey);
                }}
              />
            ))}
          </div>
        ) : null}
      </Record>
    </RecordBed>
  );
}
