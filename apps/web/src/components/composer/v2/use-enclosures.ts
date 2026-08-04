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
  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: async () => (await mediaApi.list(capsuleId)).data,
  });

  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

      setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, partsTotal: ticket.parts.length } : u)));

      const completedParts: { partNumber: number; eTag: string }[] = [];
      for (const part of ticket.parts) {
        const start = (part.partNumber - 1) * PART_SIZE_BYTES;
        const end = Math.min(start + PART_SIZE_BYTES, encrypted.length);
        const res = await fetch(part.url, { method: 'PUT', body: encrypted.slice(start, end) });
        completedParts.push({ partNumber: part.partNumber, eTag: res.headers.get('etag') ?? '' });
        setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, partsDone: u.partsDone + 1 } : u)));
      }

      await mediaApi.complete(ticket.mediaId, { parts: completedParts });
      setUploading((prev) => prev.filter((u) => u.id !== uploadId));
      await refresh();
    } catch {
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
    uploading,
    recording,
    onFiles: (files) => {
      if (!files) return;
      for (const file of Array.from(files)) void uploadFile(file);
    },
    onRecord: () => (recording ? stopRecording() : void startRecording()),
    onRemoveMedia: (item) => {
      void mediaApi.delete(item.id).then(refresh);
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
