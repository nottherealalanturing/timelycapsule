import { decryptBytes } from '@tc/crypto';

/**
 * Fetches an enclosure's ciphertext and opens it with the capsule key.
 *
 * The same twelve bytes of IV, the same slice, the same call — written twice
 * before this, once in the owner's capsule page and once in the recipient's
 * reveal, which meant the two halves of the product could disagree about how
 * to read the same object. Zero-access holds either way: the bytes arrive
 * encrypted and are opened here, on the device, never on a server.
 */
export async function decryptEnclosure(url: string, capsuleKey: Uint8Array): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch enclosure: ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return decryptBytes(capsuleKey, bytes.slice(0, 12), bytes.slice(12));
}

/** A size, stated the way every other figure in the product is. */
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What kind of thing this is, in the product's words rather than a MIME type.
 *
 * `07 §XII` wants an icon never to appear without a label at a consequential
 * moment, and an enclosure inside a sealed letter is exactly that.
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

/** The engraved mark for a kind — single weight, unfilled (`07 §XII`). */
export function enclosureGlyph(kind: string): string {
  switch (kind) {
    case 'audio':
    case 'voice':
      return '♪';
    case 'video':
      return '▤';
    case 'document':
      return '▥';
    case 'archive':
      return '▦';
    default:
      return '▣';
  }
}
