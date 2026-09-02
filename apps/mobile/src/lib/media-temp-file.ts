import { generateSalt, toBase64Url } from '@tc/crypto';
import { File, Paths } from 'expo-file-system';

/**
 * React Native's object-URL equivalent. Web's `EnclosureViewer` holds
 * decrypted plaintext as a `Blob`/`URL.createObjectURL` for exactly as long
 * as the viewer is open, then revokes it (`URL.revokeObjectURL`) on
 * unmount. RN has no blob-URL concept — `Image`/`expo-video`/`expo-audio`
 * all need a real URI — so the equivalent here is a real temp file in the
 * OS cache directory (`Paths.cache`, "a place to store files that can be
 * deleted by the system when the device runs low on storage" — never the
 * document directory, which is meant to persist), written once per open
 * and deleted once per close/unmount. This is exactly the bounded,
 * cleaned-up lifecycle the readiness audit's own security requirement for
 * this ticket calls for.
 *
 * A random filename (not derived from the enclosure's real name) — the
 * cache directory is sandboxed to this app, but there's no reason to leak
 * a recipient's original filename into a path string that could end up in
 * a crash report or a native file picker's "recent" list.
 */
export function writeTempMediaFile(bytes: Uint8Array, extension: string): { uri: string; cleanup: () => void } {
  const name = `${toBase64Url(generateSalt()).replace(/[^a-zA-Z0-9]/g, '')}${extension}`;
  const file = new File(Paths.cache, name);
  file.create();
  file.write(bytes);
  return {
    uri: file.uri,
    cleanup: () => {
      try {
        if (file.exists) file.delete();
      } catch {
        // Best-effort — a leftover cache-directory file is reclaimed by the
        // OS regardless, and this must never throw during unmount.
      }
    },
  };
}

/** A best-effort extension so the native player/viewer can infer the right handler — falls back to the kind's own generic MIME. */
export function extensionFor(mime: string | null, originalName: string | null): string {
  if (originalName) {
    const match = /\.[a-zA-Z0-9]+$/.exec(originalName);
    if (match) return match[0];
  }
  if (mime) {
    const subtype = mime.split('/')[1];
    if (subtype) return `.${subtype.replace(/[^a-zA-Z0-9]/g, '')}`;
  }
  return '';
}
