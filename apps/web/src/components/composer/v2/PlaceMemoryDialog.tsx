'use client';

import { Button, Dialog, Input } from '@tc/ui-web';
import { useState } from 'react';
import { placesApi } from '../../../lib/api-client';
import type { PlaceMemory } from '../../../lib/letter-envelope';

export interface PlaceMemoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PlaceMemory | null;
  onSave: (place: PlaceMemory) => void;
}

type LocateStatus = 'idle' | 'locating' | 'denied' | 'unavailable' | 'timeout' | 'insecure';
type LookupStatus = 'idle' | 'looking-up' | 'failed';

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
 * a column. The server is not told where its users write from — *unless* they
 * press "Look up this place," which is the one and only path a coordinate can
 * take off this device. Nothing calls it automatically, and the coordinate is
 * never stored anywhere server-side even then: it's a stateless lookup
 * (`modules/places`), the returned name comes straight back into this dialog,
 * and the client is what writes it into the envelope.
 */
export function PlaceMemoryDialog({ open, onOpenChange, initial, onSave }: PlaceMemoryDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    initial ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [locateStatus, setLocateStatus] = useState<LocateStatus>('idle');
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>('idle');

  function locate() {
    // getCurrentPosition itself would just hang or throw an opaque error in
    // an insecure context (plain http, not localhost) — most visible when
    // testing over a LAN IP from a phone, where it's easy to mistake for the
    // feature being broken rather than the page needing https.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setLocateStatus('insecure');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateStatus('unavailable');
      return;
    }
    setLocateStatus('locating');
    setLookupStatus('idle');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocateStatus('idle');
      },
      (err) => {
        // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT —
        // collapsing all three into "denied" told a person whose GPS simply
        // timed out indoors to go change a permission that was never the problem.
        if (err.code === err.PERMISSION_DENIED) setLocateStatus('denied');
        else if (err.code === err.TIMEOUT) setLocateStatus('timeout');
        else setLocateStatus('unavailable');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function lookUpName() {
    if (!coords) return;
    setLookupStatus('looking-up');
    try {
      const result = await placesApi.reverseGeocode(coords);
      setName(result.name);
      setLookupStatus('idle');
    } catch {
      setLookupStatus('failed');
    }
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
          <div className="flex flex-col gap-3 rounded-[var(--radius-input)] border border-[var(--color-rule)] px-3 py-2">
            <div className="flex flex-col gap-1">
              <span className="font-[var(--font-mono)] text-[length:var(--text-caption)] uppercase tracking-[0.1em] text-secondary">
                Fix
              </span>
              <span className="font-[var(--font-mono)] text-[length:var(--text-body-s)] tabular-nums text-foreground">
                {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-[var(--color-rule)] pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void lookUpName()}
                loading={lookupStatus === 'looking-up'}
              >
                Look up this place
              </Button>
              {/* Stated before the click matters, not after — this is the
                  one moment a coordinate can leave the device. */}
              <p className="text-[length:var(--text-caption)] text-secondary">
                Sends this fix to our lookup service to find a name. Nothing else is shared, and it isn&apos;t stored
                there.
              </p>
              {lookupStatus === 'failed' ? (
                <p role="alert" className="text-[length:var(--text-caption)] text-secondary">
                  Couldn&apos;t look that up just now. You can still name it yourself below.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <Button type="button" variant="secondary" onClick={locate} loading={locateStatus === 'locating'}>
            Use my current location
          </Button>
        )}

        {locateStatus === 'denied' ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-secondary">
            Location access was refused. Allow it for this site in your browser settings, then try again.
          </p>
        ) : null}
        {locateStatus === 'timeout' ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-secondary">
            That took too long to answer — a weak signal indoors can cause this. Try again, or name the place
            yourself below.
          </p>
        ) : null}
        {locateStatus === 'unavailable' ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-secondary">
            This browser cannot report a location. You can still name the place yourself below.
          </p>
        ) : null}
        {locateStatus === 'insecure' ? (
          <p role="alert" className="text-[length:var(--text-body-s)] text-secondary">
            Location needs a secure (https) connection. You can still name the place yourself below.
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
