import { eq } from 'drizzle-orm';
import { zipSync } from 'fflate';
import {
  capsuleRecipients,
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
export const dataExportHandler: ActionHandler = async ({ db, subjectId: userId }) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return; // account deleted before this ran

  const ownedCapsules = await db.select().from(capsules).where(eq(capsules.ownerId, userId));
  const adapter = getStorageAdapter();
  const files: Record<string, Uint8Array> = {};
  const metadata: Record<string, unknown>[] = [];

  for (const capsule of ownedCapsules) {
    const [media, recipients, tagRows] = await Promise.all([
      db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsule.id)),
      db.select().from(capsuleRecipients).where(eq(capsuleRecipients.capsuleId, capsule.id)),
      db
        .select({ name: tags.name })
        .from(capsuleTags)
        .innerJoin(tags, eq(tags.id, capsuleTags.tagId))
        .where(eq(capsuleTags.capsuleId, capsule.id)),
    ]);

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
      media: media.map((m) => ({ id: m.id, originalName: m.originalName, mime: m.mime, sizeBytes: m.sizeBytes })),
    });

    if (capsule.contentDocEnc) {
      files[`letters/${capsule.publicId}.enc`] = new Uint8Array(capsule.contentDocEnc);
    }

    for (const item of media) {
      if (!item.storageKey) continue;
      const bytes = await adapter.getObject(item.storageKey);
      if (bytes) {
        files[`media/${capsule.publicId}/${item.id}-${item.originalName ?? 'file'}`] = new Uint8Array(bytes);
      }
    }
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
