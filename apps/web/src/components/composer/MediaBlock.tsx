'use client';

import type { CapsuleDraft } from '../../lib/use-capsule-draft';
import type { MediaItem } from '@tc/contracts';
import { Button, cn } from '@tc/ui-web';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { mediaApi } from '../../lib/api-client';

const PART_SIZE_BYTES = 8 * 1024 * 1024;

interface UploadingItem {
  id: string;
  name: string;
  partsDone: number;
  partsTotal: number;
  error?: string;
}

function kindLabel(kind: MediaItem['kind']): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatBytes(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaBlock({ capsuleId, draft }: { capsuleId: string; draft: CapsuleDraft }) {
  const queryClient = useQueryClient();
  const queryKey = ['media', capsuleId] as const;
  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: async () => (await mediaApi.list(capsuleId)).data,
  });
  const [uploading, setUploading] = useState<UploadingItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRafRef = useRef<number | null>(null);

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
        const chunk = encrypted.slice(start, end);
        const res = await fetch(part.url, { method: 'PUT', body: chunk });
        const eTag = res.headers.get('etag') ?? '';
        completedParts.push({ partNumber: part.partNumber, eTag });
        setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, partsDone: u.partsDone + 1 } : u)));
      }

      await mediaApi.complete(ticket.mediaId, { parts: completedParts });
      setUploading((prev) => prev.filter((u) => u.id !== uploadId));
      await refresh();
    } catch {
      setUploading((prev) => prev.map((u) => (u.id === uploadId ? { ...u, error: 'Upload failed' } : u)));
    }
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setLevel(avg / 255);
      analyserRafRef.current = requestAnimationFrame(tick);
    }
    tick();

    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
      setLevel(0);
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close();
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
      void uploadFile(file);
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

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      void uploadFile(file);
    }
  }

  async function move(item: MediaItem, direction: -1 | 1) {
    const index = items.findIndex((i) => i.id === item.id);
    const swapWith = items[index + direction];
    if (!swapWith) return;
    await Promise.all([mediaApi.patch(item.id, { position: swapWith.position }), mediaApi.patch(swapWith.id, { position: item.position })]);
    await refresh();
  }

  async function remove(item: MediaItem) {
    await mediaApi.delete(item.id);
    await refresh();
  }

  async function updateCaption(item: MediaItem, caption: string) {
    await mediaApi.patch(item.id, { caption });
    await refresh();
  }

  return (
    <section aria-label="Media" className="flex flex-col gap-3">
      <h2 className="text-[length:var(--text-body-s)] font-medium text-secondary">Media</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center text-[length:var(--text-body-s)] text-secondary',
          // Interactive, not brass — a file being dragged in is not waiting.
          dragOver
            ? 'border-[var(--color-interactive)] bg-[var(--color-bg-raised)]'
            : 'border-[var(--color-rule-strong)]',
        )}
      >
        Drag files here, or click to choose
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex items-center gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2">
        <Button type="button" variant={recording ? 'destructive' : 'secondary'} size="sm" onClick={() => (recording ? stopRecording() : void startRecording())}>
          {recording ? 'Stop recording' : 'Record voice note'}
        </Button>
        {recording ? (
          <div className="flex h-6 flex-1 items-center gap-0.5" aria-hidden>
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="w-1 bg-[var(--color-interactive)]"
                style={{ height: `${Math.max(4, level * 24 * (0.5 + Math.abs(Math.sin(i))))}px` }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {uploading.map((u) => (
        <div key={u.id} className="flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2 text-[length:var(--text-body-s)]">
          <span className="truncate text-foreground">{u.name}</span>
          <span className={u.error ? 'text-[var(--color-danger)]' : 'text-secondary'}>
            {u.error ?? `Uploading… (${u.partsDone}/${u.partsTotal})`}
          </span>
        </div>
      ))}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] p-3">
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-[length:var(--text-body-s)] text-foreground">
                  {kindLabel(item.kind)} — {item.originalName} ({formatBytes(item.sizeBytes)})
                </span>
                <input
                  placeholder="Add a caption…"
                  defaultValue={item.caption ?? ''}
                  onBlur={(e) => void updateCaption(item, e.target.value)}
                  className="rounded-[var(--radius-input)] border border-[var(--color-rule)] bg-transparent px-2 py-1 text-[length:var(--text-body-s)] text-foreground"
                />
              </div>
              <div className="flex flex-col gap-1">
                <button type="button" disabled={index === 0} onClick={() => void move(item, -1)} aria-label="Move up" className="text-secondary disabled:opacity-30">
                  ↑
                </button>
                <button type="button" disabled={index === items.length - 1} onClick={() => void move(item, 1)} aria-label="Move down" className="text-secondary disabled:opacity-30">
                  ↓
                </button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void remove(item)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
