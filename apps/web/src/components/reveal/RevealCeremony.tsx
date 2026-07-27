'use client';

import type { RevealMedia } from '@tc/contracts';
import { decryptBytes } from '@tc/crypto';
import { Button, useToast } from '@tc/ui-web';
import { motion } from 'framer-motion';
import { zipSync } from 'fflate';
import { useState } from 'react';
import { revealApi } from '../../lib/api-client';

function renderDoc(doc: unknown): string {
  const node = doc as { content?: { content?: { text?: string }[] }[] } | null;
  if (!node?.content) return '';
  return node.content.map((block) => (block.content ?? []).map((leaf) => leaf.text ?? '').join('')).join('\n\n');
}

const REACTION_EMOJIS = ['❤️', '🥹', '🎉', '😂', '🙏'];

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
    return <img src={blobUrl} alt={item.caption ?? ''} className="w-full rounded-[var(--radius-card)] object-cover" />;
  }
  if (blobUrl) {
    return (
      <a href={blobUrl} download={item.originalName ?? undefined} className="text-sm text-[var(--color-accent-gold)] underline">
        Download {item.originalName ?? item.kind}
      </a>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => void reveal()} loading={loading}>
      Decrypt &amp; view {item.kind}
    </Button>
  );
}

export function RevealCeremony({
  token,
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
  senderName: string;
  contentDoc: unknown;
  media: RevealMedia[];
  capsuleKey: Uint8Array;
  location: { lat: number; lng: number; name: string } | null;
  replyPrompt: string | null;
  allowDownload: boolean;
  alreadyOpened: boolean;
}) {
  const { show } = useToast();
  const [showCeremony, setShowCeremony] = useState(!alreadyOpened);
  const [reacted, setReacted] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState(false);

  const letterText = renderDoc(contentDoc);

  async function sendReaction(emoji: string) {
    setReacted(emoji);
    try {
      await revealApi.react(token, { emoji, note: note || undefined });
      show('Sent — they may see you reacted.');
    } catch {
      setReacted(null);
    }
  }

  async function downloadAll() {
    setDownloading(true);
    try {
      const files: Record<string, Uint8Array> = { 'letter.txt': new TextEncoder().encode(letterText) };
      for (const item of media) {
        const plaintext = await decryptMedia(item, capsuleKey);
        const name = item.originalName ?? `${item.id}.${item.kind}`;
        files[name] = plaintext;
      }
      const zipped = zipSync(files);
      const blob = new Blob([zipped as unknown as BlobPart], { type: 'application/zip' });
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

  async function saveToAccount() {
    try {
      await revealApi.save(token);
      setSaved(true);
      show('Saved to your TimelyCapsule');
    } catch {
      show('Sign in first to save this capsule to your account.');
    }
  }

  if (showCeremony) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-lg text-secondary">
          From {senderName}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-[var(--font-display)] text-3xl text-foreground"
        >
          This moment has arrived.
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1 }}>
          <Button onClick={() => setShowCeremony(false)}>Open it</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-12">
      <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="flex flex-col gap-4">
        <p className="text-sm text-secondary">From {senderName}</p>
        <div className="font-[var(--font-serif)] whitespace-pre-wrap text-lg leading-relaxed text-foreground">{letterText}</div>
      </motion.section>

      {media.length > 0 ? (
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid grid-cols-2 gap-3"
        >
          {media.map((item) => (
            <MediaTile key={item.id} item={item} capsuleKey={capsuleKey} />
          ))}
        </motion.section>
      ) : null}

      {location ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-text-secondary)]/20 p-4 text-sm text-secondary">
          📍 {location.name}
        </section>
      ) : null}

      <section className="flex flex-col items-center gap-3 border-t border-[var(--color-text-secondary)]/15 pt-8">
        <p className="text-sm text-secondary">How did this feel?</p>
        <div className="flex gap-2">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void sendReaction(emoji)}
              className={`rounded-full border px-3 py-2 text-xl transition ${reacted === emoji ? 'border-[var(--color-accent-gold)] bg-[var(--color-accent-gold)]/10' : 'border-[var(--color-text-secondary)]/20'}`}
            >
              {emoji}
            </button>
          ))}
        </div>
        {replyPrompt ? (
          <div className="flex w-full flex-col gap-2">
            <label className="text-xs text-secondary">{replyPrompt}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="rounded-[var(--radius-input)] border border-[var(--color-text-secondary)]/20 bg-transparent p-2 text-sm text-foreground"
            />
            <Button size="sm" variant="secondary" onClick={() => void sendReaction(reacted ?? '🙏')}>
              Write back
            </Button>
          </div>
        ) : null}
      </section>

      <section className="flex flex-wrap items-center justify-center gap-3 border-t border-[var(--color-text-secondary)]/15 pt-8">
        {allowDownload ? (
          <Button variant="secondary" onClick={() => void downloadAll()} loading={downloading}>
            Download all
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void saveToAccount()} disabled={saved}>
          {saved ? 'Saved to your TimelyCapsule ✓' : 'Keep this forever — save to your TimelyCapsule'}
        </Button>
      </section>
    </div>
  );
}
