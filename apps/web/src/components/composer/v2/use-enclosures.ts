'use client';

import type { MediaItem } from '@tc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { mediaApi } from '../../../lib/api-client';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';
import type { PendingEnclosure } from './enclosure-lifecycle';

const PART_SIZE_BYTES = 8 * 1024 * 1024;

export interface EnclosureController {
  items: MediaItem[];
  pending: PendingEnclosure[];
  onFiles: (files: FileList | null) => void;
  /** Encloses an already-prepared blob — the voice recorder's accepted take. */
  onEnclose: (file: File) => void;
  onRemoveMedia: (item: MediaItem) => void;
  /** Clears a stopped enclosure, and the server row it may have left behind. */
  onRemovePending: (id: string) => void;
  /** Tries a stopped enclosure again, without asking for the file back. */
  onRetryPending: (id: string) => void;
  onCaption: (item: MediaItem, caption: string) => void;
  onReorder: (item: MediaItem, direction: -1 | 1) => void;
}

/** A controller with nothing behind it, for entry points that cannot enclose files. */
export function noEnclosures(): EnclosureController {
  return {
    items: [],
    pending: [],
    onFiles: () => {},
    onEnclose: () => {},
    onRemoveMedia: () => {},
    onRemovePending: () => {},
    onRetryPending: () => {},
    onCaption: () => {},
    onReorder: () => {},
  };
}

/**
 * Enclosing, as a stated sequence rather than a wait.
 *
 * Every file walks one road — encrypted on this device, sent, finished,
 * enclosed — and each step is named while it happens. The transport itself is
 * unchanged and deliberately so: the multipart flow, the CORS/ETag diagnosis
 * and the orphaned-ticket recovery below were all learned from real failures
 * and are kept exactly. What changed is that the work became visible.
 *
 * Recording no longer lives here. A voice note is not enclosed the moment you
 * stop speaking — it is prepared, offered back, and enclosed only once the
 * writer accepts it — so the recorder owns its own take and calls `onEnclose`
 * when there is a decision to act on.
 */
export function useEnclosures(capsuleId: string, draft: CapsuleDraft): EnclosureController {
  const queryClient = useQueryClient();
  const queryKey = ['media', capsuleId] as const;
  const { data: allRows = [] } = useQuery({
    queryKey,
    queryFn: async () => (await mediaApi.list(capsuleId)).data,
  });

  // `listMedia` returns every row for the capsule regardless of status, with
  // no distinction from the shape of a finished one. Rendering all of it as
  // `items` meant a ticket whose transfer was abandoned mid-flight — page
  // closed, tab crashed, an earlier session before this fix existed — showed
  // up identically to a real enclosure: full caption/reorder/remove controls,
  // a size, nothing to say it never actually arrived. It also permanently
  // blocked sealing with no visible cause, since the seal endpoint rejects
  // any non-'ready' row for the capsule. Splitting on `status` here is what
  // makes both symptoms fixable client-side.
  const items = allRows.filter((i) => i.status === 'ready');
  const orphanedRows = allRows.filter((i) => i.status !== 'ready');

  const [pending, setPending] = useState<PendingEnclosure[]>([]);

  const orphaned: PendingEnclosure[] = orphanedRows
    // Don't double-list a row this same session is still working on — that one
    // already has a live entry in `pending` with a real stage.
    .filter((row) => !pending.some((p) => p.mediaId === row.id))
    .map((row) => ({
      id: row.id,
      name: row.originalName ?? 'A file',
      stage: 'failed' as const,
      partsDone: 0,
      partsTotal: 1,
      // Past tense, and specific: this is a row from a session that ended
      // before its bytes did, not something still trying.
      error: 'Never finished arriving',
      mediaId: row.id,
    }));

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  function update(id: string, patch: Partial<PendingEnclosure>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function enclose(file: File, existingId?: string) {
    const id = existingId ?? `${file.name}-${crypto.randomUUID()}`;
    if (existingId) {
      update(id, { stage: 'encrypting', partsDone: 0, partsTotal: 1, error: undefined });
    } else {
      setPending((prev) => [
        ...prev,
        { id, name: file.name, stage: 'encrypting', partsDone: 0, partsTotal: 1, file },
      ]);
    }

    try {
      // The slowest step for a large file, and the one that used to report
      // nothing at all — the row simply sat at `0 of 1` until it finished.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await draft.encryptForCapsule(bytes);

      const ticket = await mediaApi.createTicket(capsuleId, {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: encrypted.length,
      });

      // Recorded on the item so a later removal can also clean up this
      // ticket's row server-side — the row exists from the instant
      // `createTicket` returns, well before any bytes are sent.
      update(id, { stage: 'sending', mediaId: ticket.mediaId, partsTotal: ticket.parts.length, partsDone: 0 });

      const completedParts: { partNumber: number; eTag: string }[] = [];
      for (const part of ticket.parts) {
        const start = (part.partNumber - 1) * PART_SIZE_BYTES;
        const end = Math.min(start + PART_SIZE_BYTES, encrypted.length);
        const res = await fetch(part.url, { method: 'PUT', body: encrypted.slice(start, end) });
        // A blocked-by-CORS PUT to R2 still resolves (it isn't a network
        // error) — the browser just refuses to expose the response, and a
        // rejected presigned PUT comes back as a 403 with an XML body, not a
        // thrown exception either way. Without this check, `res.headers.get`
        // silently returned an empty ETag and the loop carried on as if the
        // byte range had actually landed.
        if (!res.ok) {
          throw new Error(`PUT failed for part ${part.partNumber}: ${res.status} ${res.statusText}`);
        }
        const eTag = res.headers.get('etag');
        if (!eTag) {
          // The PUT itself succeeded, but the browser can't see the ETag it
          // needs to hand back — this is what a CORS policy allowing the PUT
          // but missing `ExposeHeaders: ["ETag"]` looks like from here.
          throw new Error(`Part ${part.partNumber} returned no ETag (check bucket CORS ExposeHeaders)`);
        }
        completedParts.push({ partNumber: part.partNumber, eTag });
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, partsDone: p.partsDone + 1 } : p)));
      }

      // Every part has landed; the store is assembling them into one object
      // and the row is being marked ready. Real work, and on a large file
      // real time — so it is named rather than left as a gap in which the row
      // looks finished but the list has not caught up.
      update(id, { stage: 'finishing' });
      await mediaApi.complete(ticket.mediaId, { parts: completedParts });

      update(id, { stage: 'enclosed' });
      await refresh();
      // Dropped only after the refetch, so the row never disappears from one
      // list before appearing in the other.
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Enclosure failed:', err);
      update(id, { stage: 'failed', error: 'Stopped before it finished' });
    }
  }

  return {
    items,
    pending: [...pending, ...orphaned],
    onFiles: (files) => {
      if (!files) return;
      for (const file of Array.from(files)) void enclose(file);
    },
    onEnclose: (file) => void enclose(file),
    onRemoveMedia: (item) => {
      void mediaApi.delete(item.id).then(refresh);
    },
    // A stopped enclosure previously stayed in the list forever, and Seal
    // counted every entry as still in flight — so one failure could make
    // sealing permanently impossible with no way out. Clearing it locally
    // isn't enough either: `createTicket` already wrote a row before any
    // bytes went out, and the seal endpoint blocks on *any* non-ready row
    // for the capsule regardless of what the client thinks.
    onRemovePending: (id) => {
      const item = [...pending, ...orphaned].find((p) => p.id === id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      if (item?.mediaId) {
        void mediaApi
          .delete(item.mediaId)
          .then(refresh)
          .catch((err) => {
            console.error('Failed to clean up an abandoned enclosure ticket:', err);
          });
      }
    },
    onRetryPending: (id) => {
      const item = pending.find((p) => p.id === id);
      if (!item?.file) return;
      // The previous attempt may have left a half-written row behind; drop it
      // before starting again, so the capsule is never blocked by a ticket
      // nothing is working on.
      if (item.mediaId) {
        void mediaApi.delete(item.mediaId).then(refresh).catch(() => {});
      }
      void enclose(item.file, id);
    },
    onCaption: (item, caption) => {
      void mediaApi.patch(item.id, { caption }).then(refresh);
    },
    onReorder: (item, direction) => {
      const index = items.findIndex((i) => i.id === item.id);
      const swapWith = items[index + direction];
      if (!swapWith) return;
      void Promise.all([
        mediaApi.patch(item.id, { position: swapWith.position }),
        mediaApi.patch(swapWith.id, { position: item.position }),
      ]).then(refresh);
    },
  };
}
