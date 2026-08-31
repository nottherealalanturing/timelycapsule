import type { CompletedMediaPart, MediaItem } from '@tc/contracts';
import { generateSalt, toBase64Url } from '@tc/crypto';
import { File } from 'expo-file-system';
import { mediaApi } from './api-client';
import type { PickedMedia } from './media-source';

/**
 * E1.4.7 — media encryption + upload. This file is the mobile-native
 * counterpart of `apps/web/src/components/composer/v2/use-enclosures.ts`'s
 * `enclose()`: read the picked file's real bytes, encrypt them locally under
 * the capsule key, create a ticket, PUT each part, then complete. The
 * sequence is deliberately identical to web's, part for part — the only
 * platform difference is *how* bytes are read from a local URI
 * (`File.bytes()`, expo-file-system's new SDK 57 API, vs web's
 * `file.arrayBuffer()`); the crypto, the wire format, and the HTTP shape are
 * exactly what the real backend (`apps/api/src/modules/media/{routes,
 * service}.ts`) already expects — nothing new is invented here.
 *
 * **Whole file in memory, single-shot, not streaming** — matches web
 * exactly (`draft.encryptForCapsule` reads the entire file via
 * `arrayBuffer()` before calling `encryptBytes` once; there is no
 * `encryptStream` call anywhere in the live product). The E1.4 readiness
 * audit's §6.6 flagged this as a real, undecided question for a very large
 * Premium-tier file on constrained Android hardware — this ticket
 * deliberately does not resolve that with a new streaming-encryption
 * architecture (out of scope, and web itself has no such thing to match);
 * it is safe at this product's actual size caps (Free: 25 MB, confirmed in
 * `apps/api/src/modules/capsules/entitlements.ts`) and is disclosed here as
 * a known, inherited limitation rather than silently assumed away.
 *
 * **No JS-level PUT retry/resume.** A part PUT or the final `complete` call
 * failing simply throws, exactly matching web's own "an interrupted upload
 * is retried from the ticket step" behavior (E1.4 readiness audit §11) — no
 * resumable-upload machinery exists anywhere in this codebase (web
 * included), and building one is explicitly out of this ticket's scope.
 * `use-media-enclosures.ts` is what turns this throw into a retryable,
 * per-item UI state.
 */

/** Matches `apps/api/src/modules/media/service.ts`'s own `PART_SIZE_BYTES` and web's `use-enclosures.ts` — an HTTP-transport constant, unrelated to AES's own chunking (which this pipeline never uses; see the header comment above). */
const PART_SIZE_BYTES = 8 * 1024 * 1024;

export type EncloseStage = 'encrypting' | 'sending' | 'finishing' | 'enclosed' | 'failed';

export interface EncloseProgress {
  stage: EncloseStage;
  partsDone: number;
  partsTotal: number;
  /** Known only once `createTicket` has responded. */
  mediaId?: string;
}

/**
 * Hermes has no `crypto.getRandomValues`/`randomUUID` (E1.4 readiness audit
 * §6.9, already proven absent by E1.3.12) — this reuses `@tc/crypto`'s own
 * proven native CSPRNG (the same `random.native.ts` call `generateIv`/
 * `generateAesKey` already make) rather than `Math.random`, which would be
 * genuinely insecure for a value whose only job is letting the server
 * recognize a retried request as *the same* attempt. `generateSalt()` is
 * repurposed purely for its 16 random bytes — this value is not a KDF salt
 * and touches no key-derivation code path.
 */
export function randomIdempotencyKey(): string {
  return toBase64Url(generateSalt());
}

/**
 * Encrypts and uploads one picked/recorded file, start to finish.
 *
 * `ticketIdempotencyKey` is generated **once** by the caller when an item is
 * first enclosed, and passed back in unchanged on every retry of *this same
 * item* — see `mediaApi.createTicket`'s own header comment for why: if an
 * earlier attempt's `POST .../media/tickets` actually reached and was
 * processed by the server but its response never reached this client (a
 * dropped connection, not a rejection), retrying with the same key replays
 * the original ticket instead of leaving an orphaned duplicate behind. The
 * `complete` call below deliberately generates its *own* fresh key every
 * time instead of reusing one across retries — its request body
 * (`parts`/eTags) is only known after this run's own PUTs finish and can
 * legitimately differ between attempts (different parts may fail/succeed
 * each try), so a stable key there would risk an `idempotency_conflict`
 * against a *body* that was never wrong, only re-computed.
 */
export async function encloseMedia(
  capsuleId: string,
  media: PickedMedia,
  ticketIdempotencyKey: string,
  encryptForCapsule: (bytes: Uint8Array) => Promise<Uint8Array>,
  onProgress: (progress: EncloseProgress) => void,
): Promise<MediaItem> {
  onProgress({ stage: 'encrypting', partsDone: 0, partsTotal: 1 });

  // The only plaintext copy this pipeline ever holds — a local variable,
  // never written to AsyncStorage/SecureStore/SQLite, never logged, and
  // never referenced again after `encryptForCapsule` returns below.
  const plaintext = await new File(media.uri).bytes();
  const encrypted = await encryptForCapsule(plaintext);

  const ticket = await mediaApi.createTicket(
    capsuleId,
    { name: media.name, mime: media.mimeType, sizeBytes: encrypted.length },
    ticketIdempotencyKey,
  );

  onProgress({ stage: 'sending', partsDone: 0, partsTotal: ticket.parts.length, mediaId: ticket.mediaId });

  const completedParts: CompletedMediaPart[] = [];
  for (const part of ticket.parts) {
    const start = (part.partNumber - 1) * PART_SIZE_BYTES;
    const end = Math.min(start + PART_SIZE_BYTES, encrypted.length);
    // Matches web's own presigned-PUT call exactly: no headers at all — the
    // URL is signed without a fixed Content-Type (`r2-adapter.ts`'s
    // `UploadPartCommand`), so adding one here would only risk a signature
    // mismatch for no benefit. React Native's `fetch` accepts a `Uint8Array`
    // body directly (confirmed against `react-native/Libraries/Network/
    // convertRequestBody.js`, not assumed) — no `Blob` wrapping needed.
    const res = await fetch(part.url, { method: 'PUT', body: encrypted.slice(start, end) });
    if (!res.ok) {
      throw new Error(`Upload failed for part ${part.partNumber}: ${res.status}`);
    }
    const eTag = res.headers.get('etag');
    if (!eTag) {
      throw new Error(`Part ${part.partNumber} returned no ETag`);
    }
    completedParts.push({ partNumber: part.partNumber, eTag });
    onProgress({ stage: 'sending', partsDone: completedParts.length, partsTotal: ticket.parts.length, mediaId: ticket.mediaId });
  }

  onProgress({ stage: 'finishing', partsDone: ticket.parts.length, partsTotal: ticket.parts.length, mediaId: ticket.mediaId });

  const { media: completed } = await mediaApi.complete(
    ticket.mediaId,
    {
      parts: completedParts,
      durationMs: media.durationMs,
      width: media.width,
      height: media.height,
    },
    randomIdempotencyKey(),
  );

  onProgress({ stage: 'enclosed', partsDone: ticket.parts.length, partsTotal: ticket.parts.length, mediaId: ticket.mediaId });
  return completed;
}
