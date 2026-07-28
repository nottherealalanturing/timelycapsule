export interface PartUpload {
  partNumber: number;
  url: string;
}

export interface CreatedUpload {
  uploadId: string;
  parts: PartUpload[];
}

export interface CompletedPart {
  partNumber: number;
  eTag: string;
}

export interface HeadResult {
  sizeBytes: number;
}

/**
 * Object storage boundary (R2 in production). The server only ever sees
 * ciphertext through this interface — ticket text: "verifies object
 * existence/size... it can no longer sniff or process content"
 * (plan/05-BUILD-PLAYBOOK.md T-10). Kept as an interface specifically so
 * tests never need a live network call to Cloudflare — see
 * `get-adapter.ts` for the same test-mode-always-fake pattern already
 * used for email (T-07) and JWT keys (T-04).
 */
export interface StorageAdapter {
  createMultipartUpload(key: string, partCount: number): Promise<CreatedUpload>;
  completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  /** Returns null if the object doesn't exist. */
  headObject(key: string): Promise<HeadResult | null>;
  /** Direct server-side read — T-18's data-export handler embeds each media object's raw (still-encrypted) bytes into the export zip. */
  getObject(key: string): Promise<Buffer | null>;
  getSignedGetUrl(key: string, options: { expiresInSeconds: number; asAttachment: boolean; filename?: string }): Promise<string>;
  /** Single-shot presigned PUT for a client to upload directly — T-18's avatar upload (small, unencrypted, doesn't need T-10's multipart-chunking machinery). */
  getSignedPutUrl(key: string, options: { expiresInSeconds: number; contentType: string }): Promise<string>;
  /** Direct server-side write — T-18's data-export handler builds a zip in memory and writes it itself, no client involved. */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
