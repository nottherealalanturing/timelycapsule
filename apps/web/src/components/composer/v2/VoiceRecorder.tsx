'use client';

import { Button, Hallmark } from '@tc/ui-web';
import { useEffect, useRef, useState } from 'react';

/**
 * Recording, as something you decide to keep.
 *
 * Idle → Recording → Preparing → Ready → (accepted, and then the shared
 * enclosure lifecycle takes over).
 *
 * The old recorder had two states and no decision in it: pressing stop
 * encrypted and sent the take immediately, so the most personal thing anyone
 * puts in a capsule was also the only one they could never hear back, change
 * their mind about, or do again. It was the least deliberate interaction in a
 * product whose entire subject is deliberation. Nothing here becomes part of
 * the letter until the writer says so.
 */
type RecorderStage = 'idle' | 'recording' | 'preparing' | 'ready';

function elapsedReading(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function VoiceRecorder({ onAccept, onCancel }: { onAccept: (file: File) => void; onCancel: () => void }) {
  const [stage, setStage] = useState<RecorderStage>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [take, setTake] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const takeUrlRef = useRef<string | null>(null);

  // A take that is never accepted still holds an object URL. Released on
  // unmount so re-recording a dozen times doesn't leak a dozen blobs.
  useEffect(() => {
    return () => {
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // The elapsed reading, ticking only while there is something to count. It is
  // the recorder's instrument: mono and tabular, the same idiom as the Dual
  // Clock, because it is the same kind of fact.
  useEffect(() => {
    if (stage !== 'recording') return;
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 200);
    return () => clearInterval(timer);
  }, [stage]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // Assembling the chunks into one playable object is real work with a
        // real duration on a long take, so it is named rather than hidden in
        // the gap between pressing stop and something appearing.
        setStage('preparing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-recording-${Date.now()}.webm`, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
        takeUrlRef.current = url;
        setTake({ file, url });
        setStage('ready');
      };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      recorder.start();
      recorderRef.current = recorder;
      setStage('recording');
    } catch {
      // Almost always a refused microphone permission. Stated, because the
      // browser's own prompt has already gone by the time this shows.
      setError('No microphone available, or permission was refused.');
      setStage('idle');
    }
  }

  function stop() {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2.5">
          {stage === 'recording' ? (
            <>
              {/*
                A recording light: static, and red because that is the oldest
                convention in recording equipment.
                
                It does not pulse. The brief asked for one, but `07 §VI.3` —
                enforced by a lint rule in this repo — bans pulse outright on
                the grounds that nothing may read as loading, and a blinking
                dot is exactly the shape a loading indicator takes. The
                liveness is carried instead by the figure beside it, which
                advances five times a second because time is genuinely
                passing. That is the same thing the Dual Clock does, it is
                unambiguous, and it survives `prefers-reduced-motion` intact —
                a pulse would not have.
              */}
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-danger)]" />
              <Hallmark>Recording</Hallmark>
            </>
          ) : (
            <Hallmark>{stage === 'preparing' ? 'Preparing' : stage === 'ready' ? 'Ready' : 'Voice recording'}</Hallmark>
          )}
        </span>

        {stage === 'recording' || stage === 'ready' ? (
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-body-s)] tabular-nums text-foreground">
            {elapsedReading(elapsedMs)}
          </span>
        ) : null}
      </div>

      {stage === 'ready' && take ? (
        // Heard back before it is kept. A plain audio element on a local blob:
        // nothing has left this device yet, and nothing will until Enclose.
        <audio src={take.url} controls className="w-full" />
      ) : null}

      {error ? (
        <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {stage === 'idle' ? (
          <>
            <Button type="button" size="sm" onClick={() => void start()}>
              Start recording
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : null}

        {stage === 'recording' ? (
          <Button type="button" size="sm" onClick={stop}>
            Stop
          </Button>
        ) : null}

        {stage === 'ready' && take ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAccept(take.file);
                onCancel();
              }}
            >
              Enclose this
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void start()}>
              Record again
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              Discard
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
