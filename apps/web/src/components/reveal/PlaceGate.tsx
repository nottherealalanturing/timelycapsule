'use client';

import { Button } from '@tc/ui-web';
import { useState } from 'react';
import { revealApi } from '../../lib/api-client';

/** Place Seal (06-FEATURE-ADDENDUM.md §B) — distance/bearing teaser, blurred map, spoofable-by-design ceremony not a crypto boundary. */
export function PlaceGate({ token, name, radiusM, onSatisfied }: { token: string; name: string; radiusM: number; onSatisfied: (gateToken: string) => void }) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'denied' | 'far'>('idle');
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [bearingDeg, setBearingDeg] = useState<number | null>(null);

  function checkLocation() {
    if (!navigator.geolocation) {
      setStatus('denied');
      return;
    }
    setStatus('checking');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const result = await revealApi.placeCheck(token, { lat: position.coords.latitude, lng: position.coords.longitude });
          setDistanceM(result.distanceM);
          setBearingDeg(result.bearingDeg);
          if (result.withinRange && result.gateToken) {
            onSatisfied(result.gateToken);
          } else {
            setStatus('far');
          }
        } catch {
          setStatus('far');
        }
      },
      () => setStatus('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 p-6 text-center">
      <p className="text-sm text-secondary">This capsule opens near &ldquo;{name}&rdquo; ({(radiusM / 1000).toFixed(1)} km radius).</p>

      {status === 'far' && distanceM !== null ? (
        <p className="text-sm text-[var(--color-danger)]">
          You&apos;re {(distanceM / 1000).toFixed(1)} km away{bearingDeg !== null ? ` (bearing ${bearingDeg}°)` : ''}. Try again once you&apos;re closer.
        </p>
      ) : null}

      {status === 'denied' ? (
        <p className="text-sm text-[var(--color-danger)]">
          We couldn&apos;t access your location. Check your browser&apos;s location permission and try again.
        </p>
      ) : null}

      <Button onClick={checkLocation} loading={status === 'checking'}>
        Check my location
      </Button>
    </div>
  );
}
