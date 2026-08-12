import { eq } from 'drizzle-orm';
import { zipSync } from 'fflate';
import {
  capsuleRecipients,
  capsuleReplies,
  capsuleTags,
  capsules,
  collectionItems,
  collections,
  contacts,
  mediaItems,
  tags,
  users,
} from '../../../db/schema/index.js';
import { getStorageAdapter } from '../../media/index.js';
import { sendExportReady } from '../../email/index.js';
import type { ActionHandler } from './dispatch.js';

const DOWNLOAD_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * What happened to one enclosure's bytes. Every media row carries one of
 * these — there is no fourth outcome in which a row is simply absent.
 *
 *   - `included`    the encrypted file is in this zip
 *   - `released`    reclaimed from storage at the end of its retention term
 *   - `incomplete`  never finished arriving, so there were never bytes
 *   - `unavailable` expected in storage but unreadable — a real fault
 */
type MediaExportStatus = 'included' | 'released' | 'incomplete' | 'unavailable';

interface MediaExportEntry {
  id: string;
  originalName: string | null;
  mime: string | null;
  kind: string;
  sizeBytes: number | null;
  caption: string | null;
  enclosedAt: string;
  exportStatus: MediaExportStatus;
  file?: string;
  releasedAt?: string | null;
  releaseReason?: string | null;
  note?: string;
}

interface CapsuleExportEntry {
  id: string;
  publicId: string;
  type: string;
  state: string;
  title: string | null;
  teaser: string | null;
  unlockAt: string | null;
  sealedAt: string | null;
  createdAt: string;
  tags: string[];
  recipients: {
    displayName: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    firstOpenedAt: string | null;
  }[];
  media: MediaExportEntry[];
  replies: { id: string; recipientId: string; author: string; file: string; createdAt: string }[];
}

/**
 * Builds the "export everything" zip (Settings → Data, ticket text: "async
 * zip job → email link"). Zero-access holds here same as everywhere else:
 * the server never decrypts `content_doc_enc` or media bytes, so the zip
 * contains them exactly as stored (still ciphertext) plus a metadata.json
 * of the plaintext-safe envelope fields — the owner's own browser (which
 * still holds the master key) is the only thing that can ever decrypt
 * `letters/*.enc` after downloading. Whole zip is built in memory, which is
 * fine at this product's current scale (free plan caps at 100MB) — revisit
 * with real streaming if/when paid-plan accounts start exporting
 * multi-gigabyte media libraries.
 */
function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'an unrecorded date';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * A plain-text account of what is in the zip and how to read it.
 *
 * The export had no README at all until M4 — it was a folder of `.enc`
 * files and a JSON manifest, which is fine for whoever built it and close
 * to useless for the person it belongs to. It matters most in exactly the
 * case this milestone introduces: someone opening their export in 2041 and
 * finding a photograph missing needs to be told, in words, that it was
 * released on a stated date and that this was the arrangement rather than a
 * loss.
 *
 * Written in the product's own register: states what happened, states the
 * date, does not apologise, does not sell anything.
 */
function buildReadme(capsuleEntries: CapsuleExportEntry[]): string {
  const released = capsuleEntries.flatMap((c) =>
    c.media.filter((m) => m.exportStatus === 'released').map((m) => ({ capsule: c, media: m })),
  );
  const unavailable = capsuleEntries.flatMap((c) => c.media.filter((m) => m.exportStatus === 'unavailable'));
  const incomplete = capsuleEntries.flatMap((c) => c.media.filter((m) => m.exportStatus === 'incomplete'));

  const lines: string[] = [
    'YOUR TIMELYCAPSULE EXPORT',
    '',
    `Everything you have written, enclosed and received, as of ${formatDate(new Date().toISOString())}.`,
    '',
    'WHAT IS IN HERE',
    '',
    '  metadata.json   Every capsule, recipient, tag, collection and contact.',
    '  letters/        Your letters, one file per capsule.',
    '  replies/        Replies written back to your capsules.',
    '  media/          The photographs, recordings and files you enclosed.',
    '',
    'WHY THE LETTERS AND REPLIES LOOK LIKE NONSENSE',
    '',
    '  They are encrypted, and they were encrypted on your own device before',
    '  they ever reached us. We have never been able to read them. Each .enc',
    '  file is the raw ciphertext exactly as it was stored, which means it can',
    '  only be opened with your key — by you.',
    '',
  ];

  if (released.length > 0) {
    lines.push(
      'ENCLOSURES THAT WERE RELEASED',
      '',
      '  Some files are listed in metadata.json but are not in the media folder.',
      '  They were released from storage at the end of the period the capsule was',
      '  sealed with. The letter, the dates, who it was for, any replies, and the',
      '  record of the file itself — its name, size and your note about it — are',
      '  all still here and always will be. Only the file itself was removed.',
      '',
    );
    for (const { capsule, media } of released) {
      const name = media.originalName ?? 'An enclosure';
      const title = capsule.title ? `"${capsule.title}"` : capsule.publicId;
      lines.push(`  ${name} — from ${title}, released on ${formatDate(media.releasedAt)}.`);
    }
    lines.push('');
  }

  if (unavailable.length > 0) {
    lines.push(
      'ENCLOSURES WE COULD NOT READ',
      '',
      '  These should have been in storage and were not. That is a fault on our',
      '  side, not an expected outcome, and it is listed here rather than left',
      '  out silently. Please get in touch and we will look into it.',
      '',
    );
    for (const media of unavailable) {
      lines.push(`  ${media.originalName ?? 'An enclosure'}`);
    }
    lines.push('');
  }

  if (incomplete.length > 0) {
    lines.push(
      'ENCLOSURES THAT NEVER FINISHED ARRIVING',
      '',
      '  These were started but never completed, so there was never a file to',
      '  export. They are listed for completeness.',
      '',
    );
    for (const media of incomplete) {
      lines.push(`  ${media.originalName ?? 'An enclosure'}`);
    }
    lines.push('');
  }

  lines.push(
    'EVERY ENCLOSURE IS ACCOUNTED FOR',
    '',
    '  Each one in metadata.json carries an exportStatus: included, released,',
    '  incomplete or unavailable. Nothing is left out of this export without',
    '  being named in it.',
    '',
  );

  return lines.join('\n');
}

export const dataExportHandler: ActionHandler = async ({ db, subjectId: userId }) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return; // account deleted before this ran

  const ownedCapsules = await db.select().from(capsules).where(eq(capsules.ownerId, userId));
  const adapter = getStorageAdapter();
  const files: Record<string, Uint8Array> = {};
  const metadata: CapsuleExportEntry[] = [];

  for (const capsule of ownedCapsules) {
    const [media, recipients, tagRows, replyRows] = await Promise.all([
      db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsule.id)),
      db.select().from(capsuleRecipients).where(eq(capsuleRecipients.capsuleId, capsule.id)),
      db
        .select({ name: tags.name })
        .from(capsuleTags)
        .innerJoin(tags, eq(tags.id, capsuleTags.tagId))
        .where(eq(capsuleTags.capsuleId, capsule.id)),
      db.select().from(capsuleReplies).where(eq(capsuleReplies.capsuleId, capsule.id)).orderBy(capsuleReplies.createdAt),
    ]);

    const mediaEntries: MediaExportEntry[] = [];

    if (capsule.contentDocEnc) {
      files[`letters/${capsule.publicId}.enc`] = new Uint8Array(capsule.contentDocEnc);
    }

    // Same shape as `letters/*.enc` deliberately — a reply is the same kind
    // of object as the letter it answers (capsule content, encrypted with
    // the capsule key, openable only on the owner's own device), so it is
    // exported the same way rather than inlined as base64 in the manifest.
    // One convention for "capsule content in this zip", and the owner's
    // existing decrypt path works on both without a second code path.
    for (const reply of replyRows) {
      files[`replies/${capsule.publicId}/${reply.id}.enc`] = Buffer.from(reply.bodyEnc, 'base64');
    }

    /**
     * **Every enclosure is represented, whatever happened to its bytes.**
     *
     * This loop used to `continue` past any row with no `storageKey`, and
     * again past any object the bucket did not return — so a released
     * enclosure, or one whose object had gone missing, was simply not in
     * the export and nothing anywhere said so. Silence is the worst
     * available answer here: it leaves the owner unable to tell "I never
     * enclosed that" from "it is gone".
     */
    for (const item of media) {
      const base = {
        id: item.id,
        originalName: item.originalName,
        mime: item.mime,
        kind: item.kind,
        sizeBytes: item.sizeBytes,
        caption: item.caption,
        enclosedAt: item.createdAt.toISOString(),
      };
      const path = `media/${capsule.publicId}/${item.id}-${item.originalName ?? 'file'}`;

      if (item.status === 'released') {
        mediaEntries.push({
          ...base,
          exportStatus: 'released',
          releasedAt: item.releasedAt?.toISOString() ?? null,
          releaseReason: item.releaseReason,
          note: 'The original file was released from storage. Everything else about it is preserved here.',
        });
        continue;
      }

      if (item.status !== 'ready' || !item.storageKey) {
        mediaEntries.push({
          ...base,
          exportStatus: 'incomplete',
          note: 'This enclosure never finished arriving, so there are no bytes to export.',
        });
        continue;
      }

      const bytes = await adapter.getObject(item.storageKey);
      if (!bytes) {
        // A `ready` row whose object is missing is a genuine fault, not a
        // policy outcome — reported as such rather than quietly dropped.
        // This is the case that was previously invisible.
        mediaEntries.push({
          ...base,
          exportStatus: 'unavailable',
          note: 'Expected in storage but could not be read. Please contact support.',
        });
        continue;
      }

      files[path] = new Uint8Array(bytes);
      mediaEntries.push({ ...base, exportStatus: 'included', file: path });
    }

    metadata.push({
      id: capsule.id,
      publicId: capsule.publicId,
      type: capsule.type,
      state: capsule.state,
      title: capsule.title,
      teaser: capsule.teaser,
      unlockAt: capsule.unlockAt?.toISOString() ?? null,
      sealedAt: capsule.sealedAt?.toISOString() ?? null,
      createdAt: capsule.createdAt.toISOString(),
      tags: tagRows.map((t) => t.name),
      recipients: recipients.map((r) => ({
        displayName: r.displayName,
        email: r.email,
        phone: r.phone,
        status: r.status,
        firstOpenedAt: r.firstOpenedAt?.toISOString() ?? null,
      })),
      media: mediaEntries,
      // The other half of the correspondence (M3). Ciphertext, like the
      // letter — this server has never been able to read it and the export
      // does not change that.
      replies: replyRows.map((r) => ({
        id: r.id,
        recipientId: r.recipientId,
        author: r.author,
        file: `replies/${capsule.publicId}/${r.id}.enc`,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }

  const [contactRows, collectionRows, collectionItemRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.ownerId, userId)),
    db.select().from(collections).where(eq(collections.userId, userId)),
    db
      .select({ collectionId: collectionItems.collectionId, capsuleId: collectionItems.capsuleId })
      .from(collectionItems)
      .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
      .where(eq(collections.userId, userId)),
  ]);

  files['README.txt'] = new TextEncoder().encode(buildReadme(metadata));

  files['metadata.json'] = new TextEncoder().encode(
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        account: { email: user.email, displayName: user.displayName, createdAt: user.createdAt.toISOString() },
        capsules: metadata,
        contacts: contactRows.map((c) => ({ name: c.name, email: c.email, phone: c.phone, birthday: c.birthday })),
        collections: collectionRows.map((c) => ({
          name: c.name,
          capsuleIds: collectionItemRows.filter((ci) => ci.collectionId === c.id).map((ci) => ci.capsuleId),
        })),
      },
      null,
      2,
    ),
  );

  const zipped = zipSync(files, { level: 6 });
  const key = `exports/${userId}/${Date.now()}.zip`;
  await adapter.putObject(key, Buffer.from(zipped), 'application/zip');

  const downloadUrl = await adapter.getSignedGetUrl(key, {
    expiresInSeconds: DOWNLOAD_TTL_SECONDS,
    asAttachment: true,
    filename: 'timelycapsule-export.zip',
  });

  await sendExportReady(db, user.email, downloadUrl);
};
