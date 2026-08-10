'use client';

import type { MediaItem } from '@tc/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { mediaApi } from '../../../lib/api-client';
import type { CapsuleDraft } from '../../../lib/use-capsule-draft';
import type { UploadingItem } from './Enclosures';

const PART_SIZE_BYTES = 8 * 1024 * 1024;

export interface EnclosureController {
  items: MediaItem[];
  uploading: UploadingItem[];
  recording: boolean;
  onFiles: (files: FileList | null) => void;
  onRecord: () => void;
  onRemoveMedia: (item: MediaItem) => void;
  /** Clears a failed upload from the in-flight list — see the note on `error` below for why this exists. */
  onRemoveUploading: (id: string) => void;
  onCaption: (item: MediaItem, caption: string) => void;
  onReorder: (item: MediaItem, direction: -1 | 1) => void;
}

/** A controller with nothing behind it, for entry points that cannot enclose files. */
export function noEnclosures(): EnclosureController {
  return {
    items: [],
    uploading: [],
    recording: false,
    onFiles: () => {},
    onRecord: () => {},
    onRemoveMedia: () => {},
    onRemoveUploading: () => {},
    onCaption: () => {},
    onReorder: () => {},
  };
}

/**
 * Upload, record, order and caption — the parts of enclosing that talk to the
 * API, lifted out of the old `MediaBlock` so the presentation can be shared
 * between the authenticated composer and the guest flow while the transport
 * stays with whoever actually has one.
 *
 * Every file is encrypted under the capsule key before a byte leaves the
 * browser (`draft.encryptForCapsule`), which is why the upload ticket is asked
 * for the *ciphertext* length rather than the file's own.
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
  // `items` meant a ticket whose upload was abandoned mid-flight — page
  // closed, tab crashed, an earlier session before this fix existed — showed
  // up identically to a real enclosure: full caption/reorder/remove controls,
  // a size, nothing to say it never actually arrived. It also permanently
  // blocked sealing with no visible cause, since the seal endpoint rejects
  // any non-'ready' row for the capsule. Splitting on `status` here is what
  // makes both symptoms fixable client-side: unfinished rows are surfaced the
  // same way an in-session failed upload is, with a Remove that actually
  // clears the block.
  const items = allRows.filter((i) => i.status === 'ready');
  const orphanedRows = allRows.filter((i) => i.status !== 'ready');

  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const orphanedAsUploading: UploadingItem[] = orphanedRows
    // Don't double-list a row this same session is still actively uploading —
    // that one already has a live entry in `uploading` with real progress.
    .filter((row) => !uploading.some((u) => u.mediaId === row.id))
    .map((row) => ({
      id: row.id,
      name: row.originalName ?? 'Untitled',
      partsDone: 0,
      partsTotal: 1,
      error: "Didn't finish uploading",
      mediaId: row.id,
    }));
  const combinedUploading = [...uploading, ...orphanedAsUploading];

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey });
  }

  async function uploadFile(file: File) {
    const uploadId = `${file.name}-${crypto.randomUUID()}`;
    setUploading((prev) => [...prev, { id: uploadId, name: file.name, partsDone: 0, partsTotal: 1 }]);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const encrypted = await draft.encryptForCapsule(bytes);

      const ticket = await mediaApi.createTicket(capsuleId, {
        name: file.name,
        mime: file.type || 'application/octet-stream',
        sizeBytes: encrypted.length,
      });

      // Recorded on the item so a later `onRemoveUploading` can also clean
      // up this ticket's row server-side — the row already exists in the
      // database from the instant `createTicket` returns, well before any
      // bytes are sent.
      setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, mediaId: ticket.mediaId, partsTotal: ticket.parts.length } : u)));

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
        // byte range had actually landed, so `complete()` below was called
        // with fabricated part data — R2 rejects that at completion time,
        // several steps away from where the upload actually failed.
        if (!res.ok) {
          throw new Error(`Upload PUT failed for part ${part.partNumber}: ${res.status} ${res.statusText}`);
        }
        const eTag = res.headers.get('etag');
        if (!eTag) {
          // The PUT itself succeeded, but the browser can't see the ETag
          // it needs to hand back — this is what a CORS policy allowing the
          // PUT but missing `ExposeHeaders: ["ETag"]` looks like from here.
          throw new Error(`Upload part ${part.partNumber} succeeded but returned no ETag (check bucket CORS ExposeHeaders)`);
        }
        completedParts.push({ partNumber: part.partNumber, eTag });
        setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, partsDone: u.partsDone + 1 } : u)));
      }

      await mediaApi.complete(ticket.mediaId, { parts: completedParts });
      setUploading((prev) => prev.filter((u) => u.id !== uploadId));
      await refresh();
    } catch (err) {
      console.error('Enclosure upload failed:', err);
      setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, error: "Couldn't upload" } : u)));
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      void uploadFile(new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' }));
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  return {
    items,
    uploading: combinedUploading,
    recording,
    onFiles: (files) => {
      if (!files) return;
      for (const file of Array.from(files)) void uploadFile(file);
    },
    onRecord: () => (recording ? stopRecording() : void startRecording()),
    onRemoveMedia: (item) => {
      void mediaApi.delete(item.id).then(refresh);
    },
    // A failed upload previously stayed in `uploading` forever — the catch
    // block in uploadFile annotates the item with `.error` but never removes
    // it, and SealMovement counts *every* entry in `uploading` (error or not)
    // as still in flight and disables Seal on that count. Found by actually
    // uploading against an unconfigured R2 bucket CORS policy and hitting a
    // real dead end: no server-side failure should ever be able to make
    // sealing permanently impossible with no way out.
    //
    // Clearing the item locally isn't enough on its own: `createTicket`
    // already wrote a `status: 'uploading'` row before any bytes went out,
    // and the seal endpoint blocks on *any* non-'ready' media row for the
    // capsule regardless of what the client's `uploading` array says. Left
    // alone that row is orphaned forever and every future seal attempt fails
    // with the same "still arriving" error — found by removing a failed item
    // here and then still hitting `upload_incomplete` on a fresh Seal click.
    onRemoveUploading: (id) => {
      const item = combinedUploading.find((u) => u.id === id);
      setUploading((prev) => prev.filter((u) => u.id !== id));
      if (item?.mediaId) {
        // Covers both a same-session failure and a row orphaned from an
        // earlier session (`orphanedAsUploading` above) — either way this is
        // the only thing that actually unblocks sealing, since the block is
        // keyed off the server row, not local state.
        void mediaApi
          .delete(item.mediaId)
          .then(refresh)
          .catch((err) => {
            console.error('Failed to clean up orphaned upload ticket:', err);
          });
      }
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
