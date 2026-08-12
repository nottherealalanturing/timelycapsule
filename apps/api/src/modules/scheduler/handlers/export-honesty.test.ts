import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { unzipSync, strFromU8 } from 'fflate';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '../../../env.js';
import { createApp } from '../../../app.js';
import { db, pool } from '../../../db/client.js';
import {
  capsuleRecipients,
  capsuleReplies,
  capsules,
  entitlements,
  mediaItems,
  users,
} from '../../../db/schema/index.js';
import { getStorageAdapter } from '../../media/index.js';
import { releaseCapsuleMedia } from '../../media/index.js';
import { HANDLERS } from '../index.js';

const app = createApp(db);
const clock = { now: () => new Date() };
let userId: string;
let token: string;
let capsuleId: string;
let mediaId: string;

interface MediaManifestEntry {
  id: string;
  originalName: string | null;
  exportStatus: string;
  releasedAt?: string | null;
  file?: string;
}

/** Runs the real export handler and unzips whatever it wrote to storage. */
async function runExport(): Promise<{ files: Record<string, Uint8Array>; manifest: Record<string, unknown> }> {
  const adapter = getStorageAdapter() as ReturnType<typeof getStorageAdapter> & {
    objects?: Map<string, unknown>;
  };
  const before = new Set(
    (await Promise.resolve([...((adapter as unknown as { bytes: Map<string, Buffer> }).bytes?.keys() ?? [])])).filter((k) =>
      k.startsWith('exports/'),
    ),
  );

  await HANDLERS.data_export({ db, clock, subjectId: userId });

  const keys = [...((adapter as unknown as { bytes: Map<string, Buffer> }).bytes.keys())].filter(
    (k) => k.startsWith('exports/') && !before.has(k),
  );
  expect(keys.length).toBeGreaterThan(0);
  const zipped = await adapter.getObject(keys[keys.length - 1]!);
  const files = unzipSync(new Uint8Array(zipped!));
  return { files, manifest: JSON.parse(strFromU8(files['metadata.json']!)) };
}

function mediaEntriesFor(manifest: Record<string, unknown>): MediaManifestEntry[] {
  const caps = manifest.capsules as { id: string; media: MediaManifestEntry[] }[];
  return caps.find((c) => c.id === capsuleId)!.media;
}

describe('M4 — export degrades honestly', () => {
  beforeAll(async () => {
    const email = `export-honesty-${randomUUID()}@example.com`;
    const signup = await request(app).post('/v1/auth/signup').send({
      email,
      password: 'correct-horse-battery-staple',
      displayName: 'Export Honesty',
      masterKeyWrap: 'dGVzdC1tYXN0ZXIta2V5LXdyYXA=',
      recoveryKeyWrap: 'dGVzdC1yZWNvdmVyeS1rZXktd3JhcA==',
    });
    expect(signup.status).toBe(201);
    userId = signup.body.user.id;
    token = signup.body.tokens.accessToken;

    const created = await request(app)
      .post('/v1/capsules')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'self', title: 'Export test' });
    capsuleId = created.body.capsule.id;

    await request(app)
      .patch(`/v1/capsules/${capsuleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        unlockAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        contentDocEnc: Buffer.from('letter-ciphertext').toString('base64'),
      });

    const bytes = Buffer.from('real-encrypted-enclosure-bytes');
    const ticket = await request(app)
      .post(`/v1/capsules/${capsuleId}/media/tickets`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'keepsake.jpg', mime: 'image/jpeg', sizeBytes: bytes.length });
    mediaId = ticket.body.mediaId;

    const adapter = getStorageAdapter() as ReturnType<typeof getStorageAdapter> & {
      setFakePartSize: (u: string, p: number, s: number) => void;
    };
    adapter.setFakePartSize(ticket.body.uploadId, 1, bytes.length);
    await request(app)
      .post(`/v1/media/${mediaId}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parts: [{ partNumber: 1, eTag: 'e1' }] });

    // The fake adapter's `completeMultipartUpload` records an object's size
    // but never its bytes — in a real upload those arrive via the presigned
    // PUT the client performs, which no test does. Seeded directly so the
    // `included` path is genuinely exercised. (Without this the row exports
    // as `unavailable`, which is itself the honest-degradation path working
    // correctly, and is asserted separately below.)
    const [seeded] = await db.select({ storageKey: mediaItems.storageKey }).from(mediaItems).where(eq(mediaItems.id, mediaId));
    await getStorageAdapter().putObject(seeded!.storageKey!, bytes, 'image/jpeg');

    await request(app).post(`/v1/capsules/${capsuleId}/seal`).set('Authorization', `Bearer ${token}`);

    // A real reply, so the export can be checked for it (M3 content that
    // "export everything" previously omitted entirely).
    const [recipient] = await db
      .insert(capsuleRecipients)
      .values({ capsuleId, email: `r-${randomUUID()}@example.com`, accessTokenHash: randomUUID() })
      .returning();
    await db.insert(capsuleReplies).values({
      capsuleId,
      recipientId: recipient!.id,
      author: 'recipient',
      bodyEnc: Buffer.from('reply-ciphertext').toString('base64'),
    });
  }, 30000);

  afterAll(async () => {
    await db.delete(capsules).where(eq(capsules.ownerId, userId));
    await db.delete(entitlements).where(eq(entitlements.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await pool.end();
  });

  it('before release: the enclosure is included, and the reply is exported as ciphertext', async () => {
    const { files, manifest } = await runExport();

    const entries = mediaEntriesFor(manifest);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.exportStatus).toBe('included');
    expect(files[entries[0]!.file!]).toBeTruthy();

    // The letter and the reply travel the same way — ciphertext, one file each.
    expect(Object.keys(files).some((f) => f.startsWith('letters/'))).toBe(true);
    const replyFiles = Object.keys(files).filter((f) => f.startsWith('replies/'));
    expect(replyFiles).toHaveLength(1);
    expect(strFromU8(files[replyFiles[0]!]!)).toBe('reply-ciphertext');

    const caps = manifest.capsules as { id: string; replies: unknown[] }[];
    expect(caps.find((c) => c.id === capsuleId)!.replies).toHaveLength(1);

    expect(files['README.txt']).toBeTruthy();
  });

  it('after release: the enclosure is still named, with its status and date — never omitted', async () => {
    await releaseCapsuleMedia(db, capsuleId, { reason: 'retention' });

    const { files, manifest } = await runExport();
    const entries = mediaEntriesFor(manifest);

    // The critical assertion: entry count still matches the media rows.
    const rows = await db.select().from(mediaItems).where(eq(mediaItems.capsuleId, capsuleId));
    expect(entries).toHaveLength(rows.length);
    expect(entries).toHaveLength(1);

    expect(entries[0]!.exportStatus).toBe('released');
    expect(entries[0]!.originalName).toBe('keepsake.jpg');
    expect(entries[0]!.releasedAt).toBeTruthy();
    // No bytes, and no pretence of them.
    expect(entries[0]!.file).toBeUndefined();
    expect(Object.keys(files).some((f) => f.startsWith(`media/`) && f.includes('keepsake'))).toBe(false);

    // The README explains it in words, not just a JSON enum.
    const readme = strFromU8(files['README.txt']!);
    expect(readme).toContain('ENCLOSURES THAT WERE RELEASED');
    expect(readme).toContain('keepsake.jpg');

    // And the correspondence still travels.
    expect(Object.keys(files).filter((f) => f.startsWith('replies/'))).toHaveLength(1);
  });
});
