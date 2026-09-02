import { decryptBytes } from '@tc/crypto';

/**
 * PHASE-5.3's own read-side media boundary — mirrors `apps/web/src/lib/
 * enclosure-media.ts` exactly (`decryptEnclosure`, `formatBytes`,
 * `enclosureNoun`): same fetch, same `iv(12)‖ciphertext` slice, same
 * `decryptBytes` call, same noun set. No new cryptography — this composes
 * `@tc/crypto`'s existing `decryptBytes`, already proven against real
 * web-sealed media (E1.4.7's own audit confirmed the wire format matches
 * byte-for-byte).
 */
export async function decryptEnclosure(url: string, capsuleKey: Uint8Array): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch enclosure: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return decryptBytes(capsuleKey, bytes.slice(0, 12), bytes.slice(12));
}

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What kind of thing this is, in words — matches web's own `enclosureNoun`
 * full six-way set exactly, deliberately not reusing `review.tsx`'s own
 * narrower three-way `enclosureKindWord` (Audio/Video/File), which was
 * scoped to the creation-side Review screen's own simpler needs, not this
 * one's. `07-EXPERIENCE-BIBLE.md` §XII: an icon never appears without a
 * label at a consequential moment, and every enclosure inside a sealed
 * letter is exactly that.
 */
export function enclosureNoun(kind: string): string {
  switch (kind) {
    case 'image':
      return 'Photograph';
    case 'video':
      return 'Video';
    case 'audio':
    case 'voice':
      return 'Voice recording';
    case 'document':
      return 'Document';
    case 'archive':
      return 'Archive';
    default:
      return 'Enclosure';
  }
}
