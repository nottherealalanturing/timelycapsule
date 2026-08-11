'use client';

import { Hallmark, cn } from '@tc/ui-web';
import { useEffect, useRef, useState } from 'react';
import { enclosureGlyph, enclosureNoun, formatBytes } from '../../lib/enclosure-media';

export interface ViewableEnclosure {
  id: string;
  kind: string;
  mime: string | null;
  caption: string | null;
  originalName: string | null;
  sizeBytes?: number | null;
}

/**
 * Opening mirrors enclosing. M1 named the road in: encrypted here, sent,
 * finished, enclosed. This is the road back out, and it is stated the same
 * way — a named step, never a spinner (`07 §XVI`).
 */
type ViewerStage = 'closed' | 'opening' | 'open' | 'failed';

export interface EnclosureViewerProps {
  enclosure: ViewableEnclosure;
  /** Fetches and decrypts. Transport and keys stay with the caller; this owns presentation. */
  load: () => Promise<Uint8Array>;
  /** Honours the sender's decision — `allowDownload` on the capsule. */
  allowDownload?: boolean;
  className?: string;
}

/**
 * **An enclosed artifact, opened in place.**
 *
 * One viewer, both sides of the product. The owner's capsule page used to
 * call `window.open(blobUrl)` and throw the thing into a browser tab; the
 * recipient's reveal rendered a bare `<img>` for images and a download link
 * for everything else, so a voice recording — the most intimate thing anyone
 * encloses — could not be played anywhere in the product that received it.
 * Two viewers, neither of which viewed much.
 *
 * Three rules shape what replaces them:
 *
 *   1. **In place, never a modal.** `07 §XVI` bans modals on the wait or
 *      reveal path outright, and it is right to: a lightbox over a letter
 *      makes the letter a gallery. The artifact opens where it lies, inside
 *      the record it belongs to, and closes back down to its label.
 *   2. **The chrome is a museum label, not a file browser.** A hallmark
 *      naming what kind of thing this is, its size, and the sender's own
 *      note beneath it as the plate. No filename as a heading, no toolbar,
 *      no zoom furniture — `07 §XII` puts the imagery of the product in its
 *      own artifacts, and the enclosure *is* the artifact here.
 *   3. **Nothing opens itself.** Decryption is work and the bytes are the
 *      recipient's to ask for, so every artifact waits to be opened. That
 *      also keeps a page of enclosures from decrypting a hundred megabytes
 *      nobody asked to see.
 *
 * Deliberately layout-only in its responsiveness: the same component serves
 * every breakpoint and carries no web-only concept, so the mobile client can
 * render the same states from the same props.
 */
export function EnclosureViewer({ enclosure, load, allowDownload = true, className }: EnclosureViewerProps) {
  const [stage, setStage] = useState<ViewerStage>('closed');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // An object URL outlives the component unless it is revoked. Released on
  // unmount so opening a dozen enclosures does not strand a dozen blobs.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function open() {
    setStage('opening');
    try {
      const plaintext = await load();
      // TS's DOM lib types BlobPart's ArrayBufferView as Uint8Array<ArrayBuffer>
      // specifically, excluding the wider Uint8Array<ArrayBufferLike> the
      // crypto package returns — the same lib-version quirk as `bs()` there,
      // not a real runtime distinction.
      const blob = new Blob([plaintext as unknown as BlobPart], {
        type: enclosure.mime ?? 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setObjectUrl(url);
      setStage('open');
    } catch (err) {
      console.error('Could not open enclosure:', err);
      setStage('failed');
    }
  }

  const noun = enclosureNoun(enclosure.kind);
  const label = enclosure.caption || enclosure.originalName || noun;

  return (
    <figure
      className={cn(
        'flex flex-col gap-3 rounded-[var(--radius-record)] border border-[var(--color-rule)] p-3 sm:p-4',
        className,
      )}
    >
      {/* The accession line: what this is, and how much of it there is. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2">
          <span aria-hidden className="font-[family-name:var(--font-mono)] text-[var(--color-text-secondary)]">
            {enclosureGlyph(enclosure.kind)}
          </span>
          <Hallmark>{noun}</Hallmark>
        </span>
        {enclosure.sizeBytes ? (
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] text-[var(--color-text-secondary)]">
            {formatBytes(enclosure.sizeBytes)}
          </span>
        ) : null}
      </div>

      {stage === 'open' && objectUrl ? (
        <Rendered enclosure={enclosure} url={objectUrl} label={label} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-s)] text-[var(--color-text-primary)]">
            {label}
          </span>
          {stage === 'opening' ? (
            // Named, held, and quiet — the same shape M1's readings take.
            <span className="shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--text-caption)] text-[var(--color-text-secondary)]">
              Opening
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void open()}
              className="shrink-0 text-[length:var(--text-body-s)] text-[var(--color-interactive)] underline underline-offset-2"
            >
              {stage === 'failed' ? 'Try again' : 'Open'}
            </button>
          )}
        </div>
      )}

      {stage === 'failed' ? (
        <p role="alert" className="text-[length:var(--text-body-s)] text-[var(--color-danger)]">
          This could not be opened. The file may not have finished arriving when the capsule was sealed.
        </p>
      ) : null}

      {/* The plate. The sender's own words about the thing, under the thing —
          shown only when it is not already doing duty as the label above. */}
      {stage === 'open' && enclosure.caption ? (
        <figcaption className="text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]">
          {enclosure.caption}
        </figcaption>
      ) : null}

      {stage === 'open' && allowDownload && objectUrl ? (
        <a
          href={objectUrl}
          download={enclosure.originalName ?? undefined}
          className="self-start text-[length:var(--text-caption)] text-[var(--color-interactive)] underline underline-offset-2"
        >
          Keep a copy
        </a>
      ) : null}
    </figure>
  );
}

/**
 * The artifact itself.
 *
 * Every kind the product accepts is rendered where it can be, and stated
 * plainly where it cannot. A document that no browser can display is not a
 * failure to be dressed up as one — it is a thing you take away with you.
 */
function Rendered({ enclosure, url, label }: { enclosure: ViewableEnclosure; url: string; label: string }) {
  const kind = enclosure.kind;
  const isPdf = enclosure.mime === 'application/pdf';

  if (kind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- decrypted blob: URL, next/image cannot optimise this
      <img src={url} alt={enclosure.caption ?? label} className="w-full rounded-[var(--radius-input)]" />
    );
  }

  if (kind === 'video') {
    return <video src={url} controls playsInline className="w-full rounded-[var(--radius-input)]" />;
  }

  if (kind === 'audio' || kind === 'voice') {
    return <audio src={url} controls className="w-full" />;
  }

  if (isPdf) {
    return (
      <object
        data={url}
        type="application/pdf"
        aria-label={label}
        className="h-[28rem] w-full rounded-[var(--radius-input)] border border-[var(--color-rule)]"
      >
        {/* Mobile browsers largely refuse to embed PDFs. Stated rather than
            left as an empty frame. */}
        <p className="p-4 text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]">
          This document cannot be shown here. Keep a copy to read it.
        </p>
      </object>
    );
  }

  return (
    <p className="text-[length:var(--text-body-s)] text-[var(--color-text-secondary)]">
      {label} — kept as it was enclosed. Take a copy to open it.
    </p>
  );
}
