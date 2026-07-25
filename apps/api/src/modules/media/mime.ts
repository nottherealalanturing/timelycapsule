import type { MediaKind } from '@tc/contracts';
import { ApiError } from '../../lib/errors.js';

/**
 * MIME allow-list (03-ARCHITECTURE.md §9's kinds: image/video/audio/document/archive).
 * Not spec'd exhaustively in the plan — chosen to cover the common formats
 * each client-side pipeline step (T-11's MediaUploader) is expected to produce.
 */
const MIME_TO_KIND: Record<string, MediaKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'image/gif': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/wav': 'audio',
  'audio/webm': 'audio',
  'audio/ogg': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/zip': 'archive',
  'application/x-zip-compressed': 'archive',
};

export function mimeToKind(mime: string): MediaKind {
  const kind = MIME_TO_KIND[mime];
  if (!kind) {
    throw ApiError.unsupportedMediaType(mime);
  }
  return kind;
}
