'use client';

import { encryptBytes, generateCapsuleKey, toBase64Url } from '@tc/crypto';
import { Button, Input, useToast } from '@tc/ui-web';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { guestApi } from '../../lib/api-client';
import { encodeIvCiphertext } from '../../lib/capsule-crypto';
import { getGuestToken, setGuestCapsule, setGuestToken } from '../../lib/guest-store';

const GRADIENT_PRESETS: { value: string; theme: string }[] = [
  { value: 'linear-gradient(135deg, #F4A261, #E76F51)', theme: 'sunset' },
  { value: 'linear-gradient(135deg, #2A9D8F, #264653)', theme: 'deep-sea' },
  { value: 'linear-gradient(135deg, #E9C46A, #F4A261)', theme: 'golden-hour' },
  { value: 'linear-gradient(135deg, #8E7CC3, #4A4E69)', theme: 'twilight' },
];

const MAX_CHARS = 5000;
const MIN_HORIZON_MS = 5 * 60 * 1000;
const MAX_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;

function textToDoc(text: string): object {
  return {
    type: 'doc',
    content: text
      .split('\n\n')
      .filter((block) => block.trim().length > 0)
      .map((block) => ({ type: 'paragraph', content: [{ type: 'text', text: block }] })),
  };
}

function defaultUnlockLocal(): { date: string; time: string } {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

export default function GuestComposerPage() {
  const router = useRouter();
  const { show } = useToast();
  const [guestToken, setGuestTokenState] = useState<string | null>(null);
  const [cover, setCover] = useState(GRADIENT_PRESETS[3]);
  const [title, setTitle] = useState('');
  const [letter, setLetter] = useState('');
  const [{ date, time }, setDateTime] = useState(defaultUnlockLocal());
  const [sealing, setSealing] = useState(false);
  const [handoff, setHandoff] = useState<{ url: string; capsuleId: string } | null>(null);
  const [mountedAtMs] = useState(() => Date.now());

  useEffect(() => {
    const existing = getGuestToken();
    const timer = setTimeout(() => {
      if (existing) {
        setGuestTokenState(existing);
        return;
      }
      void guestApi.createSession().then((res) => {
        setGuestToken(res.guestToken);
        setGuestTokenState(res.guestToken);
      });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const unlockAt = date && time ? new Date(`${date}T${time}`) : null;
  const horizonMs = unlockAt ? unlockAt.getTime() - mountedAtMs : null;
  const horizonError =
    horizonMs === null
      ? null
      : horizonMs < MIN_HORIZON_MS
        ? 'Unlock time must be at least 5 minutes from now'
        : horizonMs > MAX_HORIZON_MS
          ? 'Guests can travel up to a year — accounts go to 50'
          : null;

  async function seal() {
    if (!guestToken || !unlockAt || horizonError || letter.trim().length === 0) return;
    setSealing(true);
    try {
      const created = await guestApi.createCapsule(guestToken, { title: title || undefined, cover: { kind: 'gradient', value: cover.value, theme: cover.theme } });
      const capsuleKey = generateCapsuleKey();
      const { iv, ciphertext } = await encryptBytes(capsuleKey, new TextEncoder().encode(JSON.stringify(textToDoc(letter))));
      const contentDocEnc = encodeIvCiphertext(iv, ciphertext);

      await guestApi.patchCapsule(guestToken, created.id, { contentDocEnc, unlockAt: unlockAt.toISOString() });
      await guestApi.sealCapsule(guestToken, created.id);

      const capsuleKeyB64 = toBase64Url(capsuleKey);
      setGuestCapsule({ capsuleId: created.id, recipientToken: created.recipientToken!, capsuleKeyB64 });

      const url = `${window.location.origin}/c/${created.recipientToken}#k=${capsuleKeyB64}`;
      setHandoff({ url, capsuleId: created.id });
    } catch {
      show('Something went wrong sealing your capsule. Try again.');
    } finally {
      setSealing(false);
    }
  }

  if (handoff) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">Sealed. Now send it.</h1>
        <p className="max-w-md text-secondary">
          This link is the only way to open your capsule — copy it now and send it yourself. There&apos;s no account, so
          if you lose it, it&apos;s gone for good.
        </p>
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 p-3">
          <code className="break-all text-xs text-secondary">{handoff.url}</code>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(handoff.url);
              show('Link copied');
            }}
          >
            Copy link
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/try/capsule/${handoff.capsuleId}`)}>
            Continue
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <div>
        <h1 className="font-[var(--font-display)] text-2xl text-foreground">Write something for later</h1>
        <p className="text-sm text-secondary">No account needed. One capsule, up to a year out.</p>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex h-32 items-end rounded-[var(--radius-card)] p-4" style={{ background: cover.value }}>
          <div className="flex gap-2">
            {GRADIENT_PRESETS.map((preset) => (
              <button
                key={preset.theme}
                type="button"
                aria-label={`Use ${preset.theme} cover`}
                onClick={() => setCover(preset)}
                className={`h-7 w-7 rounded-full border-2 ${cover.value === preset.value ? 'border-white' : 'border-white/40'}`}
                style={{ background: preset.value }}
              />
            ))}
          </div>
        </div>
        <Input label="Title (optional)" placeholder="Name this capsule…" value={title} onChange={(e) => setTitle(e.target.value)} />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-secondary">Letter</label>
        <textarea
          value={letter}
          onChange={(e) => setLetter(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Write what you want them to know…"
          rows={10}
          className="rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 px-4 py-3 text-foreground"
        />
        <p className="text-right text-xs text-secondary">{letter.length} / {MAX_CHARS}</p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-secondary">When it opens</label>
        <div className="flex gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDateTime((s) => ({ ...s, date: e.target.value }))}
            className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 px-3 py-2 text-foreground"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setDateTime((s) => ({ ...s, time: e.target.value }))}
            className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 px-3 py-2 text-foreground"
          />
        </div>
        <p className="text-xs text-secondary">Guests can travel up to a year — accounts go to 50.</p>
        {horizonError ? <p className="text-sm text-[var(--color-danger)]">{horizonError}</p> : null}
      </section>

      <section className="flex flex-col gap-2 opacity-60">
        {['Photos & media', 'Send by email', 'Place, passphrase & identity seals'].map((label) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-[var(--radius-card)] border border-dashed border-[var(--color-text-secondary)]/20 px-4 py-3"
          >
            <span className="text-sm text-foreground">{label}</span>
            <span className="text-xs text-secondary">Sign up free to unlock</span>
          </div>
        ))}
      </section>

      <Button size="lg" onClick={() => void seal()} loading={sealing} disabled={!guestToken || !!horizonError || letter.trim().length === 0}>
        Seal it
      </Button>
    </main>
  );
}
