'use client';

import type { RevealMedia } from '@tc/contracts';
import { decryptBytes } from '@tc/crypto';
import { Button, Record, useToast } from '@tc/ui-web';
import { zipSync } from 'fflate';
import { useEffect, useRef, useState } from 'react';
import { revealApi } from '../../lib/api-client';
import { envelopeText } from '../../lib/letter-envelope';
import { TransitStage } from './TransitStage';
import { segment, useTransit } from './use-transit';

/**
 * Accepts both the V2 letter envelope and the bare document older capsules
 * hold — a recipient must never meet a blank screen because the shape changed
 * after their capsule was sealed.
 */
const renderDoc = envelopeText;

/**
 * Named reactions, not emoji. `07 §VIII.5` bans emoji absolutely, with no
 * exception carved out for reactions — and a word survives being read aloud by
 * a screen reader, quoted in an email, or set in the record's own serif, which
 * a glyph does not.
 */
const REACTIONS = ['Thank you', 'I miss you', 'I remember', 'This landed', 'I love you'] as const;

async function decryptMedia(item: RevealMedia, capsuleKey: Uint8Array): Promise<Uint8Array> {
  const res = await fetch(item.viewUrl);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  return decryptBytes(capsuleKey, iv, ciphertext);
}

function MediaTile({ item, capsuleKey }: { item: RevealMedia; capsuleKey: Uint8Array }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      const plaintext = await decryptMedia(item, capsuleKey);
      const blob = new Blob([plaintext as unknown as BlobPart], { type: item.mime ?? 'application/octet-stream' });
      setBlobUrl(URL.createObjectURL(blob));
    } finally {
      setLoading(false);
    }
  }

  if (blobUrl && item.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element -- decrypted blob: URL, next/image can't optimize this
    return <img src={blobUrl} alt={item.caption ?? ''} className="w-full rounded-[var(--radius-record)] object-cover" />;
  }
  if (blobUrl) {
    return (
      <a href={blobUrl} download={item.originalName ?? undefined} className="text-[length:var(--text-body-s)] underline underline-offset-4">
        Download {item.originalName ?? item.kind}
      </a>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void reveal()} loading={loading}>
      Open {item.kind}
    </Button>
  );
}

/**
 * The record, at rest. Everything after the crossing lives here.
 *
 * `07 §IV` phase 6 gives the reveal one obligation — **"Disappear."** The
 * product's job at this moment is to not be in the room, which is why `07
 * §II.7` forbids branding, "powered by", and any share prompt at the emotional
 * peak. V1 closed with *"Keep this forever — save to your TimelyCapsule ✓"*,
 * which put our name in the last line of someone's letter from their mother.
 */
function RecordAtRest({
  token,
  senderName,
  letterText,
  media,
  capsuleKey,
  location,
  replyPrompt,
  allowDownload,
  letterProgress,
}: {
  token: string;
  senderName: string;
  letterText: string;
  media: RevealMedia[];
  capsuleKey: Uint8Array;
  location: { lat: number; lng: number; name: string } | null;
  replyPrompt: string | null;
  allowDownload: boolean;
  /** 0→1 across the letter's staggered arrival; 1 on a return visit. */
  letterProgress: number;
}) {
  const { show } = useToast();
  const [reacted, setReacted] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // `06 §Accessibility` — focus moves to the letter heading once it has arrived.
  useEffect(() => {
    if (letterProgress >= 1) headingRef.current?.focus();
  }, [letterProgress]);

  async function sendReaction(reaction: string) {
    setReacted(reaction);
    try {
      await revealApi.react(token, { emoji: reaction, note: note || undefined });
      show('Sent.');
    } catch {
      setReacted(null);
    }
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      const files: Record<string, Uint8Array> = { 'letter.txt': new TextEncoder().encode(letterText) };
      for (const item of media) {
        files[item.originalName ?? `${item.id}.${item.kind}`] = await decryptMedia(item, capsuleKey);
      }
      const blob = new Blob([zipSync(files) as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'capsule.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  const paragraphs = letterText.split('\n\n').filter(Boolean);

  return (
    <Record as="article" className="flex flex-col gap-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-[length:var(--text-body-s)] text-secondary outline-none">
        {senderName} wrote to you.
      </h1>

      <div className="flex flex-col gap-5">
        {paragraphs.map((para, i) => (
          <p
            key={i}
            className="whitespace-pre-wrap"
            style={{
              // Three lines staggered 90ms (`06`, 4100–4700). Opacity only —
              // nothing slides, because the letter did not exist before and so
              // has nowhere to slide from.
              opacity: Math.min(1, Math.max(0, letterProgress * 3 - i * 0.3)),
            }}
          >
            {para}
          </p>
        ))}
      </div>

      {media.length > 0 ? (
        <section className="grid grid-cols-2 gap-3">
          {media.map((item) => (
            <MediaTile key={item.id} item={item} capsuleKey={capsuleKey} />
          ))}
        </section>
      ) : null}

      {location ? (
        <p className="text-[length:var(--text-body-s)] text-secondary">Written at {location.name}</p>
      ) : null}

      <section className="flex flex-col gap-3 border-t border-[var(--color-rule)] pt-6">
        <p className="text-[length:var(--text-body-s)] text-secondary">Reply to {senderName}</p>
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map((reaction) => (
            <button
              key={reaction}
              type="button"
              onClick={() => void sendReaction(reaction)}
              className={`rounded-[var(--radius-record)] border px-3 py-1.5 text-[length:var(--text-body-s)] ${
                reacted === reaction
                  ? 'border-[var(--color-rule-strong)] text-foreground'
                  : 'border-[var(--color-rule)] text-secondary'
              }`}
            >
              {reaction}
            </button>
          ))}
        </div>
        {replyPrompt ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="reply" className="text-[length:var(--text-body-s)] text-secondary">
              {replyPrompt}
            </label>
            <textarea
              id="reply"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-[var(--radius-record)] border border-[var(--color-rule)] bg-transparent p-3 text-[length:var(--text-body-s)]"
            />
            <Button size="sm" variant="secondary" onClick={() => void sendReaction(reacted ?? 'Wrote back')}>
              Send
            </Button>
          </div>
        ) : null}
      </section>

      {/*
        Custody, not marketing (`07 §IV` phase 7: "Export, print, download. It
        is theirs, not ours."). `07 §V.7` — re-reading must be trivial and
        unlimited, and they must be able to keep a copy outside our walls.
      */}
      <section className="flex flex-wrap gap-3 border-t border-[var(--color-rule)] pt-6">
        {allowDownload ? (
          <Button variant="secondary" size="sm" onClick={() => void downloadAll()} loading={downloading}>
            Download a copy
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={saved}
          onClick={async () => {
            try {
              await revealApi.save(token);
              setSaved(true);
            } catch {
              show('Sign in to keep this.');
            }
          }}
        >
          {saved ? 'Kept' : 'Keep this'}
        </Button>
      </section>
    </Record>
  );
}

export function RevealCeremony({
  token,
  publicId,
  senderName,
  contentDoc,
  media,
  capsuleKey,
  location,
  replyPrompt,
  allowDownload,
  alreadyOpened,
}: {
  token: string;
  publicId: string;
  senderName: string;
  contentDoc: unknown;
  media: RevealMedia[];
  capsuleKey: Uint8Array;
  location: { lat: number; lng: number; name: string } | null;
  replyPrompt: string | null;
  allowDownload: boolean;
  alreadyOpened: boolean;
}) {
  // `06`: "Never replay. Returning to an opened capsule shows the record at
  // rest. Ceremony repeated is spectacle." `07 §V.6` restates it as a rule of
  // the constitution — and §V.7 immediately guarantees the *document* is never
  // gated, only the animation.
  const transit = useTransit(!alreadyOpened);
  const letterText = renderDoc(contentDoc);

  if (alreadyOpened) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-[--measure-record]">
          <RecordAtRest
            token={token}
            senderName={senderName}
            letterText={letterText}
            media={media}
            capsuleKey={capsuleKey}
            location={location}
            replyPrompt={replyPrompt}
            allowDownload={allowDownload}
            letterProgress={1}
          />
        </div>
      </main>
    );
  }

  const letterProgress = segment(transit.elapsedMs, transit.marks.recordEnd, transit.marks.letterEnd);

  return (
    <main
      // `06 §Implementation` — "Skippable at any point. Tap advances to the end
      // state. The reveal belongs to the recipient; if they want the letter
      // now, they get the letter now." Not a button, because a button at this
      // moment is a thing to decide about; the whole surface is the target.
      onClick={transit.skip}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') transit.skip();
      }}
      role="presentation"
    >
      <p aria-live="polite" className="sr-only">
        {transit.opened ? `Capsule opened. ${senderName} wrote to you.` : ''}
      </p>
      <TransitStage transit={transit} publicId={publicId}>
        <RecordAtRest
          token={token}
          senderName={senderName}
          letterText={letterText}
          media={media}
          capsuleKey={capsuleKey}
          location={location}
          replyPrompt={replyPrompt}
          allowDownload={allowDownload}
          letterProgress={letterProgress}
        />
      </TransitStage>
    </main>
  );
}
