import { randomUUID } from 'node:crypto';
import type { CompletedPart, CreatedUpload, HeadResult, StorageAdapter } from './storage-adapter.js';

interface FakeUpload {
  key: string;
  parts: Map<number, number>; // partNumber -> simulated byte size
}

const FAKE_PART_SIZE_BYTES = 8 * 1024 * 1024; // matches the 8 MB chunking in 03-ARCHITECTURE.md §9

/**
 * In-memory stand-in for R2, used whenever NODE_ENV=test (see get-adapter.ts).
 * Simulates enough of S3's multipart contract that headObject/complete can be
 * asserted against without a live network call: presigned URLs are fake
 * localhost URLs never actually fetched, and each completed part is assumed
 * to be a full FAKE_PART_SIZE_BYTES chunk except the caller-supplied size on
 * completion, which is tracked via completedSizeBytes overrides.
 */
export class FakeStorageAdapter implements StorageAdapter {
  private readonly uploads = new Map<string, FakeUpload>();
  private readonly objects = new Map<string, number>();

  async createMultipartUpload(key: string, partCount: number): Promise<CreatedUpload> {
    const uploadId = randomUUID();
    this.uploads.set(uploadId, { key, parts: new Map() });
    const parts = Array.from({ length: partCount }, (_, i) => ({
      partNumber: i + 1,
      url: `https://fake-storage.test/${encodeURIComponent(key)}/${uploadId}/${i + 1}`,
    }));
    return { uploadId, parts };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) {
      throw new Error('unknown upload');
    }
    const totalSize = parts.reduce((sum, part) => {
      const size = upload.parts.get(part.partNumber) ?? FAKE_PART_SIZE_BYTES;
      return sum + size;
    }, 0);
    this.objects.set(key, totalSize);
    this.uploads.delete(uploadId);
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const upload = this.uploads.get(uploadId);
    if (upload && upload.key === key) {
      this.uploads.delete(uploadId);
    }
  }

  async headObject(key: string): Promise<HeadResult | null> {
    const sizeBytes = this.objects.get(key);
    return sizeBytes === undefined ? null : { sizeBytes };
  }

  async getSignedGetUrl(
    key: string,
    options: { expiresInSeconds: number; asAttachment: boolean; filename?: string },
  ): Promise<string> {
    const disposition = options.asAttachment ? `attachment;filename=${options.filename ?? ''}` : 'inline';
    return `https://fake-storage.test/${encodeURIComponent(key)}?expires=${options.expiresInSeconds}&disposition=${encodeURIComponent(disposition)}`;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Test-only escape hatch: lets a test declare the real byte size for a part before completion. */
  setFakePartSize(uploadId: string, partNumber: number, sizeBytes: number): void {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.parts.set(partNumber, sizeBytes);
    }
  }

  /** Test-only escape hatch: directly seed an object's recorded size, bypassing the multipart flow. */
  seedObject(key: string, sizeBytes: number): void {
    this.objects.set(key, sizeBytes);
  }
}
