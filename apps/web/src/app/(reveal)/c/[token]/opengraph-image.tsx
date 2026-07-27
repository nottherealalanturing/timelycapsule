import { ImageResponse } from 'next/og';

export const alt = 'TimelyCapsule';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4001/v1';

const GRADIENTS: Record<string, [string, string]> = {
  sunset: ['#f6b26b', '#e06666'],
  'deep-sea': ['#1c3d5a', '#0b1e33'],
  'golden-hour': ['#f4c95d', '#e08e45'],
  twilight: ['#4a4a7a', '#1e1e3a'],
  meadow: ['#7bb87b', '#3f7a4f'],
  sky: ['#7ec8e3', '#3a7ca5'],
};

function countdownLabel(unlockAt: string | null): string {
  if (!unlockAt) return 'Sealed';
  const ms = new Date(unlockAt).getTime() - Date.now();
  if (ms <= 0) return 'Opening now';
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Opens in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return `Opens in ${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * Cover + countdown only — never capsule content, per the ticket's explicit
 * requirement (this route runs server-side but content is E2E ciphertext
 * the server can't read anyway; the constraint is about not exposing the
 * cover/teaser-adjacent metadata as more than a teaser).
 */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let senderName = 'Someone';
  let unlockAt: string | null = null;
  let gradientKey = 'twilight';

  try {
    const res = await fetch(`${API_URL}/r/${token}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'locked' || data.status === 'unlocked') {
        senderName = data.senderName ?? senderName;
        unlockAt = data.unlockAt ?? null;
        if (data.cover?.kind === 'gradient') gradientKey = data.cover.value;
      }
    }
  } catch {
    // Fall through to the default preview — a link-preview bot should never see a broken image.
  }

  const [from, to] = GRADIENTS[gradientKey] ?? GRADIENTS.twilight!;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${from}, ${to})`,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 40, color: 'rgba(255,255,255,0.85)', marginBottom: 24 }}>TimelyCapsule</div>
        <div style={{ fontSize: 64, color: '#fff', fontWeight: 600, marginBottom: 16 }}>From {senderName}</div>
        <div style={{ fontSize: 36, color: 'rgba(255,255,255,0.9)' }}>{countdownLabel(unlockAt)}</div>
      </div>
    ),
    { ...size },
  );
}
