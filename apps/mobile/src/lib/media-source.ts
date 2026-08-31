import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

/**
 * Media source selection (E1.4.5) — the native-mobile shape of web's own
 * "Enclose something" menu (`apps/web/src/components/composer/v2/
 * Enclosures.tsx`, confirmed by direct read, not assumed from the older
 * planning docs). Web offers exactly two enclosure kinds: "A photograph,
 * video, or file" (one `<input type="file" multiple>`) and "A voice
 * recording" (the inline `VoiceRecorder`) — place-as-memory is a third,
 * unrelated "enclosure" kind (text/location in the letter envelope, no
 * object storage involved) and is out of scope here entirely.
 *
 * Mobile has no single OS picker that spans camera capture, an existing
 * photo/video, and an arbitrary file the way a browser's file input does —
 * those are three genuinely different native affordances. Splitting web's
 * one "photograph, video, or file" kind into three source choices (camera,
 * library, file) is therefore a mobile-native *adaptation* of that same
 * product kind, not an invented one.
 *
 * `'voice'` (E1.4.6) is the fourth, real source now that the recorder exists
 * (`../components/voice-recorder.tsx`) — but it is handled by an entirely
 * different mechanism than the other three: those are one-shot async native
 * pickers (`pickForSource` below), while voice is an interactive multi-step
 * UI (record → preview → accept/discard) with no single "launch and await a
 * result" call to make. `pickForSource` is therefore typed to exclude it —
 * `compose.tsx` branches on `'voice'` before ever calling `pickForSource`,
 * opening the recorder instead. See that component's own header comment for
 * the full lifecycle.
 *
 * This file only *selects and normalizes* — it never encrypts, uploads, or
 * touches the network. That boundary is deliberate: `packages/contracts`'
 * `CreateMediaTicketRequestSchema` and the real upload pipeline
 * (`apps/web/src/components/composer/v2/use-enclosures.ts`'s `enclose()`)
 * are E1.4.7's job. `PickedMedia` below carries exactly the fields that
 * pipeline will eventually need (`name`/`mimeType`/`sizeBytes` map directly
 * to `CreateMediaTicketRequest`; `width`/`height`/`durationMs` map to
 * `CompleteMediaRequest`'s optional metadata) — nothing invented beyond
 * that contract, and no `kind` field, since the server derives that itself
 * from `mimeType` (`apps/api/src/modules/media/mime.ts`'s `mimeToKind`).
 */
export type MediaSourceKind = 'camera' | 'library' | 'file' | 'voice';

export interface PickedMedia {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
  width?: number;
  height?: number;
  durationMs?: number;
}

export type PickResult =
  | { status: 'picked'; media: PickedMedia[] }
  | { status: 'cancelled' }
  | { status: 'permission_denied' };

/**
 * Mirrors `apps/api/src/modules/media/mime.ts`'s own `MIME_TO_KIND` allow-
 * list — duplicated deliberately, not re-derived: `apps/api` is a separate
 * deployable, not a package `apps/mobile` can import from. This is a UX
 * improvement only (the native file picker offers only compatible files, so
 * a pick can't fail deep inside E1.4.7's future upload with "unsupported
 * media type") — the server remains the actual, authoritative enforcement,
 * and this list must be kept in sync by hand if the server's ever changes.
 */
const SUPPORTED_FILE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'audio/ogg',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
];

function normalizeImagePickerAsset(asset: ImagePicker.ImagePickerAsset): PickedMedia {
  return {
    uri: asset.uri,
    // Neither field is guaranteed by every OS/asset source (`fileName`/
    // `mimeType` are both typed optional) — falling back on `asset.type`
    // (always present, and all this picker is ever configured to return is
    // 'image' | 'video') rather than inventing unrelated content.
    name: asset.fileName ?? (asset.type === 'video' ? 'Video' : 'Photo'),
    mimeType: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    sizeBytes: asset.fileSize ?? null,
    width: asset.width || undefined,
    height: asset.height || undefined,
    durationMs: asset.duration ?? undefined,
  };
}

function normalizeDocumentPickerAsset(asset: DocumentPicker.DocumentPickerAsset): PickedMedia {
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    sizeBytes: asset.size ?? null,
  };
}

/**
 * Just-in-time permission (Decision 18, `EXECUTION-BACKLOG.md`'s own E4.4
 * acceptance criterion: "each media kind's permission prompt fires only at
 * the point of use, never earlier") — this is only ever called from the
 * moment the user taps "Camera", never at app start or composer entry.
 */
export async function pickFromCamera(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'permission_denied' };

  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'] });
  if (result.canceled) return { status: 'cancelled' };
  return { status: 'picked', media: result.assets.map(normalizeImagePickerAsset) };
}

/** Same just-in-time rule as `pickFromCamera` — requested only when "Photo & Video Library" is tapped. */
export async function pickFromLibrary(): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'permission_denied' };

  // Multiple selection matches web's own `<input type="file" multiple>` —
  // the product lets a writer enclose several photos/videos in one pass on
  // both platforms, not a mobile-only restriction.
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true });
  if (result.canceled) return { status: 'cancelled' };
  return { status: 'picked', media: result.assets.map(normalizeImagePickerAsset) };
}

/**
 * No permission request here — confirmed from `expo-document-picker`'s own
 * docs: Android's Storage Access Framework and iOS's `UIDocumentPicker` are
 * both system UI the app never needs a runtime grant to invoke.
 */
export async function pickFile(): Promise<PickResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUPPORTED_FILE_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return { status: 'cancelled' };
  return { status: 'picked', media: result.assets.map(normalizeDocumentPickerAsset) };
}

export async function pickForSource(source: Exclude<MediaSourceKind, 'voice'>): Promise<PickResult> {
  switch (source) {
    case 'camera':
      return pickFromCamera();
    case 'library':
      return pickFromLibrary();
    case 'file':
      return pickFile();
  }
}

/** A size, stated the way every other figure in the product is — matches `apps/web/src/lib/enclosure-media.ts`'s `formatBytes` exactly. */
export function formatMediaSize(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Normalizes an accepted voice take (`voice-recorder.tsx`'s own job to
 * produce the `uri`/`durationMs`) into the same `PickedMedia` shape the
 * other three sources use — `compose.tsx`'s `pendingMedia` list never needs
 * to know whether an entry came from a picker or the recorder. `.m4a`
 * (`RecordingPresets.HIGH_QUALITY`'s container on both platforms) is
 * `audio/mp4` on the wire — confirmed against `apps/api/src/modules/media/
 * mime.ts`'s own allow-list, not guessed; `audio/m4a`/`audio/x-m4a` are not
 * in that list and would fail E1.4.7's future upload. `sizeBytes` is `null`:
 * `expo-audio` does not report it, and adding `expo-file-system` merely to
 * stat one file is unnecessary dependency weight for a field E1.4.7 can
 * derive itself from the same bytes it will already need to read to encrypt.
 */
export function normalizeVoiceRecording(uri: string, durationMs: number): PickedMedia {
  return {
    uri,
    name: `Voice recording ${new Date().toISOString()}.m4a`,
    mimeType: 'audio/mp4',
    sizeBytes: null,
    durationMs,
  };
}
