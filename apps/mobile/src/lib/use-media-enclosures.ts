import type { MediaItem } from '@tc/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { capsulesApi, mediaApi } from './api-client';
import { encloseMedia, randomIdempotencyKey, type EncloseStage } from './media-upload';
import type { PickedMedia } from './media-source';

/**
 * A file this screen is (or was) working on, distinct from `MediaItem`
 * (a server-confirmed, `status: 'ready'` row) — mirrors
 * `apps/web/src/components/composer/v2/enclosure-lifecycle.ts`'s own
 * `PendingEnclosure` shape and `use-enclosures.ts`'s split between `items`
 * (ready) and `pending` (everything else), not an invented state machine.
 *
 * `media`/`ticketIdempotencyKey` are only present for an item enclosed
 * *this* session — an orphaned row recovered from a previous session (see
 * `refresh` below) has neither, which is exactly why it offers Remove but
 * never Retry: the original bytes no longer exist anywhere to retry with.
 */
export interface PendingEnclosure {
  id: number;
  name: string;
  stage: EncloseStage;
  partsDone: number;
  partsTotal: number;
  error?: string;
  mediaId?: string;
  media?: PickedMedia;
  ticketIdempotencyKey?: string;
}

export interface MediaEnclosuresController {
  /** Truly attached — `status: 'ready'` server rows, safe to seal with. */
  items: MediaItem[];
  /** In-flight this session, or recovered from a previous one that never finished. */
  pending: PendingEnclosure[];
  /** Fires immediately on pick/record-accept — matches web's own instant-enclose behavior, not a staged "attach later" step. */
  enclose: (media: PickedMedia) => void;
  /** Re-attempts a failed item using the bytes already held in memory — a no-op for an orphaned row (see the type comment above). */
  retry: (id: number) => void;
  /** Removes a pending/failed row locally, and best-effort deletes its server-side ticket if one was ever created. */
  removePending: (id: number) => void;
  /** Detaches an already-`ready` item — a real, immediate server delete (`DELETE /media/:id`), not a local-only hide. */
  removeItem: (item: MediaItem) => void;
}

/**
 * Owns the pending→attached lifecycle for one capsule's enclosures
 * (E1.4.7). `encryptForCapsule` is `null` until `useCapsuleCompose`'s
 * capsule key has resolved — the media UI only ever mounts once that
 * screen's `state.status === 'ready'`, so this is a type-safety guard, not
 * a reachable runtime gap in practice.
 *
 * Deliberately holds **no** persistence of its own: this is plain
 * component-lifetime React state (matching every other mobile hook in this
 * codebase — there is no react-query here, see `auth-context.tsx`'s own
 * header note), not a second draft store. Leaving Compose mid-upload simply
 * un-mounts this hook; the in-flight `encloseMedia` promise (and the real
 * network calls behind it) keep running until they settle regardless — the
 * exact same "abandoned mid-flight" characteristic web's own tab-close
 * behavior already has, not a new mobile-specific gap. `mountedRef` below
 * only silences the resulting "setState after unmount" React warning; it
 * does not cancel the underlying upload, matching web exactly (which has no
 * cancellation either). Reopening Compose recovers any such abandoned
 * ticket as an orphaned `pending` row via `refresh()`, below.
 */
export function useMediaEnclosures(
  capsuleId: string,
  encryptForCapsule: ((bytes: Uint8Array) => Promise<Uint8Array>) | null,
): MediaEnclosuresController {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [pending, setPending] = useState<PendingEnclosure[]>([]);
  const nextId = useRef(0);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const refresh = useCallback(async () => {
    const { data } = await capsulesApi.media(capsuleId);
    if (!mountedRef.current) return;
    setItems(data.filter((m) => m.status === 'ready'));
    setPending((prev) => {
      const known = new Set(prev.map((p) => p.mediaId).filter((v): v is string => v !== undefined));
      // A row this session's own `pending` list is still tracking already
      // has a live entry with a real stage — only a row *neither* ready nor
      // already known locally is one a previous session left behind.
      const orphaned: PendingEnclosure[] = data
        .filter((m) => m.status !== 'ready' && !known.has(m.id))
        .map((m) => ({
          id: nextId.current++,
          name: m.originalName ?? 'A file',
          stage: 'failed' as const,
          partsDone: 0,
          partsTotal: 1,
          error: 'Never finished arriving',
          mediaId: m.id,
        }));
      return [...prev, ...orphaned];
    });
  }, [capsuleId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback((id: number, patch: Partial<PendingEnclosure>) => {
    if (!mountedRef.current) return;
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const runEnclose = useCallback(
    async (id: number, media: PickedMedia, ticketIdempotencyKey: string) => {
      if (!encryptForCapsule) return;
      try {
        await encloseMedia(capsuleId, media, ticketIdempotencyKey, encryptForCapsule, (progress) => {
          update(id, { stage: progress.stage, partsDone: progress.partsDone, partsTotal: progress.partsTotal, mediaId: progress.mediaId });
        });
        if (!mountedRef.current) return;
        await refresh();
        setPending((prev) => prev.filter((p) => p.id !== id));
      } catch {
        // The thrown error is always a plain status/shape message (see
        // media-upload.ts's own throw sites) — never plaintext, ciphertext,
        // or key material — but it is still not shown to the user verbatim;
        // a stated, calm sentence matches this product's established error
        // copy convention (`AutosaveIndicator`, `ErrorState`) better than an
        // HTTP status code would.
        update(id, { stage: 'failed', error: 'Stopped before it finished' });
      }
    },
    [capsuleId, encryptForCapsule, refresh, update],
  );

  const enclose = useCallback(
    (media: PickedMedia) => {
      const id = nextId.current++;
      const ticketIdempotencyKey = randomIdempotencyKey();
      setPending((prev) => [
        ...prev,
        { id, name: media.name, stage: 'encrypting', partsDone: 0, partsTotal: 1, media, ticketIdempotencyKey },
      ]);
      void runEnclose(id, media, ticketIdempotencyKey);
    },
    [runEnclose],
  );

  const retry = useCallback(
    (id: number) => {
      setPending((prev) => {
        const item = prev.find((p) => p.id === id);
        if (!item?.media || !item.ticketIdempotencyKey) return prev;
        void runEnclose(id, item.media, item.ticketIdempotencyKey);
        return prev.map((p) => (p.id === id ? { ...p, stage: 'encrypting', partsDone: 0, partsTotal: 1, error: undefined } : p));
      });
    },
    [runEnclose],
  );

  const removePending = useCallback((id: number) => {
    setPending((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item?.mediaId) {
        void mediaApi.delete(item.mediaId).catch(() => {
          // Best-effort cleanup, matching web's own `onRemovePending` — the
          // row is already gone from this screen either way.
        });
      }
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const removeItem = useCallback(
    (item: MediaItem) => {
      void mediaApi.delete(item.id).then(refresh);
    },
    [refresh],
  );

  return { items, pending, enclose, retry, removePending, removeItem };
}
