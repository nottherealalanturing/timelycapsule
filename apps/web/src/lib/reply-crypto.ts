import { decryptBytes, encryptBytes } from '@tc/crypto';
import { decodeIvCiphertext, encodeIvCiphertext } from './capsule-crypto';

/**
 * A reply is capsule content, so it is encrypted exactly like capsule content.
 *
 * The key is the **capsule key** — the one both parties already hold, and the
 * reason no key exchange was needed to build this. The recipient carries it in
 * the `#k=` fragment of their link (it never reaches a server); the sender
 * unwraps it from `ownerKeyWrap` with their master key. There is exactly one
 * key per capsule and therefore exactly one conversation, which is the same
 * shape as the object being imitated: a letter and its answer live in the same
 * envelope.
 *
 * Wire format is `iv||ciphertext` base64'd once, identical to `contentDocEnc`
 * and every enclosure — one format for everything sealed, so there is one
 * place to get it right.
 */
export async function sealReply(capsuleKey: Uint8Array, text: string): Promise<string> {
  const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(text));
  return encodeIvCiphertext(iv, ciphertext);
}

export async function openReply(capsuleKey: Uint8Array, bodyEnc: string): Promise<string> {
  const { iv, ciphertext } = decodeIvCiphertext(bodyEnc);
  return new TextDecoder().decode(await decryptBytes(capsuleKey, iv, ciphertext));
}
