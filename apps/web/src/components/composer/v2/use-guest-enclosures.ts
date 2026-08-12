'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiClientError, guestApi } from '../../../lib/api-client';
import type { GuestDraft } from '../../../lib/use-guest-draft';
import type { PendingEnclosure } from './enclosure-lifecycle';
import type { EnclosureController } from './use-enclosures';

const PART_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * Guest's `useEnclosures` — the same lifecycle, the same
 * `EnclosureController` shape, the same transport (multipart PUT with the
 * identical CORS/ETag handling), talking to the guest-scoped routes
 * instead of the authenticated ones. `Enclosures.tsx`/`ComposeMovement.tsx`
 * cannot tell the difference, which is the point: one enclosing component,
 * two identity-scoped services behind it.
 *
 * The one real difference from the account version is `capsuleId` itself.
 * The authenticated composer always has one — the route it's mounted on
 * guarantees it. A guest does not, until `draft.ensureMediaCapsule()`
 * creates it on the first file — so every call here resolves that first,
 * which is free after the first real call (the result is cached on the
 * draft).
 */
export function useGuestEnclosures(draft: GuestDraft, guestToken: string | null): EnclosureController {
  const queryClient = useQueryClient();
  const capsuleId = draft.mediaCapsuleId;
  const queryKey = ['guest-media', capsuleId] as const;

  const { data: allRows = [] } = useQuery({
    queryKey,
    queryFn: async () => (await guestApi.media.list(guestToken!, capsuleId!)).data,
    // Nothing to list before a capsule exists — this is the common case
    // (most guest drafts never enclose anything) and not an error state.
    enabled: Boolean(capsuleId && guestToken),
  });

  const items = allRows.filter((i) => i.status === 'ready');
  const orphanedRows = allRows.filter((i) => i.status !== 'ready');

  const [pending, setPending] = useState<PendingEnclosure[]>([]);

  const orphaned: PendingEnclosure[] = orphanedRows
    .filter((row) => !pending.some((p) => p.mediaId === row.id))
    .map((row) => ({
      id: row.id,
      name: row.originalName ?? 'A file',
      stage: 'failed' as const,
      partsDone: 0,
      partsTotal: 1,
      error: 'Never finished arriving',
      mediaId: row.id,
    }));

  // Takes the capsule id explicitly rather than always closing over the
  // hook's own `capsuleId` — found by actually enclosing a first file and
  // watching it vanish. `enclose()` is defined fresh every render, but the
  // *specific instance* invoked for someone's first enclosure was created
  // while `draft.mediaCapsuleId` was still null (the capsule didn't exist
  // yet), so its closure's `queryKey` was permanently `['guest-media',
  // null]` — calling the outer `refresh()` after `complete()` succeeded
  // invalidated that stale, wrong key forever, never the real one.
  async function refresh(forCapsuleId: string | null = capsuleId) {
    await queryClient.invalidateQueries({ queryKey: ['guest-media', forCapsuleId] });
  }

  function update(id: string, patch: Partial<PendingEnclosure>) {
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function enclose(file: File, existingId?: string) {
    const id = existingId ?? `${file.name}-${crypto.randomUUID()}`;
    if (existingId) {
      update(id, { stage: 'encrypting', partsDone: 0, partsTotal: 1, error: undefined });
    } else {
      setPending((prev) => [...prev, { id, name: file.name, stage: 'encrypting', partsDone: 0, partsTotal: 1, file }]);
    }

    try {
      // Resolves the (possibly not-yet-created) capsule first — the same
      // await whether this is the first enclosure this session or the
      // fifth; cached after the first real creation.
      const { capsuleId: realCapsuleId } = await draft.ensureMediaCapsule();
      const token = guestToken;
      if (!token) throw new Error('Guest session is not ready yet');

      const bytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await draft.encryptForCapsule(bytes);

      const ticket = await guestApi.media.createTicket(token, realCapsuleId, {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: encrypted.length,
      });

      update(id, { stage: 'sending', mediaId: ticket.mediaId, partsTotal: ticket.parts.length, partsDone: 0 });

      const completedParts: { partNumber: number; eTag: string }[] = [];
      for (const part of ticket.parts) {
        const start = (part.partNumber - 1) * PART_SIZE_BYTES;
        const end = Math.min(start + PART_SIZE_BYTES, encrypted.length);
        const res = await fetch(part.url, { method: 'PUT', body: encrypted.slice(start, end) });
        if (!res.ok) {
          throw new Error(`PUT failed for part ${part.partNumber}: ${res.status} ${res.statusText}`);
        }
        const eTag = res.headers.get('etag');
        if (!eTag) {
          throw new Error(`Part ${part.partNumber} returned no ETag (check bucket CORS ExposeHeaders)`);
        }
        completedParts.push({ partNumber: part.partNumber, eTag });
        setPending((prev) => prev.map((p) => (p.id === id ? { ...p, partsDone: p.partsDone + 1 } : p)));
      }

      update(id, { stage: 'finishing' });
      await guestApi.media.complete(token, ticket.mediaId, { parts: completedParts });

      update(id, { stage: 'enclosed' });
      // The real id resolved above, not the outer closure's — see the note
      // on `refresh` for why that distinction is load-bearing here.
      await refresh(realCapsuleId);
      setPending((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Enclosure failed:', err);
      // Named specifically rather than the generic fallback — this is the
      // one failure mode with a real next step ("a free account gives you
      // more room"), not a transient fault worth just retrying.
      const overAllowance = err instanceof ApiClientError && err.code === 'guest_quota_exceeded';
      update(id, { stage: 'failed', error: overAllowance ? 'Over your 5 MB guest allowance' : 'Stopped before it finished' });
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
      if (!guestToken) return;
      void guestApi.media.delete(guestToken, item.id).then(() => refresh());
    },
    onRemovePending: (id) => {
      const item = [...pending, ...orphaned].find((p) => p.id === id);
      setPending((prev) => prev.filter((p) => p.id !== id));
      if (item?.mediaId && guestToken) {
        void guestApi.media
          .delete(guestToken, item.mediaId)
          .then(() => refresh())
          .catch((err) => {
            console.error('Failed to clean up an abandoned enclosure ticket:', err);
          });
      }
    },
    onRetryPending: (id) => {
      const item = pending.find((p) => p.id === id);
      if (!item?.file) return;
      if (item.mediaId && guestToken) {
        void guestApi.media.delete(guestToken, item.mediaId).then(() => refresh()).catch(() => {});
      }
      void enclose(item.file, id);
    },
    onCaption: (item, caption) => {
      if (!guestToken) return;
      void guestApi.media.patch(guestToken, item.id, { caption }).then(() => refresh());
    },
    onReorder: (item, direction) => {
      if (!guestToken) return;
      const index = items.findIndex((i) => i.id === item.id);
      const swapWith = items[index + direction];
      if (!swapWith) return;
      void Promise.all([
        guestApi.media.patch(guestToken, item.id, { position: swapWith.position }),
        guestApi.media.patch(guestToken, swapWith.id, { position: item.position }),
      ]).then(() => refresh());
    },
  };
}
