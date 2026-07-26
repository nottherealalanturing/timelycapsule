import type { MediaItem } from '@tc/contracts';
import type { mediaItems } from '../../db/schema/index.js';

type MediaRow = typeof mediaItems.$inferSelect;

export function toMediaItem(row: MediaRow): MediaItem {
  return {
    id: row.id,
    capsuleId: row.capsuleId,
    kind: row.kind,
    originalName: row.originalName,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    durationMs: row.durationMs,
    width: row.width,
    height: row.height,
    caption: row.caption,
    position: row.position,
    blurhash: row.blurhash,
    status: row.status ?? 'uploading',
    encMeta: row.encMeta as Record<string, unknown> | null,
    createdAt: row.createdAt.toISOString(),
  };
}
