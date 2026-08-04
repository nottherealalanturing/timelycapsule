'use client';

import { Button, Dialog, Input } from '@tc/ui-web';
import { useState } from 'react';
import type { PlaceMemory } from '../../../lib/letter-envelope';

export interface PlaceMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PlaceMemory | null;
  onSave: (place: PlaceMemory) => void;
}

type Status = 'idle' | 'locating' | 'denied' | 'unavailable';

/**
 * Where this was written — a **memory**, not a lock.
 *
 * Deliberately separate from the Place Seal, which lives with the conditions in
 * Seal and decides whether a key unwraps. These are opposite in kind: one is a
 * fact about the record that the recipient reads, the other is a cryptographic
 * constraint that can stop them reading anything at all. V1 offered only the
 * lock and called it a Seal, which is why choosing a place felt like
 * configuration rather than remembering.
 *
 * The name carries the meaning, so it is required and the coordinates are not
 * shown as the primary reading — "Lagos Island Maternity Hospital" is a place;
 * `6.4531, 3.3958` is a fix. Coordinates are kept because they are what a map
 * can be drawn from later, and stated in mono because a reading is a hallmark.
 *
 * This is content: it travels inside the letter's encrypted envelope, never as
 * a column. The server is not told where its users write from.
 */
export function PlaceMemoryDialog({ open, onOpenChange, initial, onSave }: PlaceMemoryDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [status, setStatus] = useState<Status>('idle');

  function locate() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('idle');
      },
      () => setStatus('denied'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const canSave = name.trim().length > 0 && coords !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Where this was written"
      description="It travels with the letter, encrypted, and is shown when the capsule opens."
      width="sm"
    >
      <div className="flex flex-col gap-4">
        {coords ? (
          <div className="flex flex-col gap-1 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2">
            <span className="font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary">
              Fix
            </span>
            <span className="font-[var(--font-mono)] text-[length:var(--text-body-s)] tabular-nums text-foreground">
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </span>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={locate} loading={status === 'locating'}>
            Use my current location
          </Button>
        )}

        {status === 'denied' ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-secondary">
            Location access was refused. Allow it for this site in your browser settings, then try again.
          </p>
        ) : null}
        {status === 'unavailable' ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-secondary">
            This browser cannot report a location.
          </p>
        ) : null}

        <Input
          label="What is this place called?"
          placeholder="Lagos Island Maternity Hospital"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              if (!coords) return;
              onSave({ name: name.trim(), lat: coords.lat, lng: coords.lng });
              onOpenChange(false);
            }}
          >
            Enclose this place
          </Button>
          {coords ? (
            <Button type="button" variant="ghost" onClick={locate}>
              Locate again
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
