import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { CompletedPart, CreatedUpload, HeadResult, StorageAdapter } from './storage-adapter.js';

const PART_URL_TTL_SECONDS = 60 * 60; // 1 hour to upload each part

export class R2StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: { accountId: string; accessKeyId: string; secretAccessKey: string; endpoint: string; bucket: string }) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
    this.bucket = config.bucket;
  }

  async createMultipartUpload(key: string, partCount: number): Promise<CreatedUpload> {
    const created = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key }));
    const uploadId = created.UploadId!;

    const parts = await Promise.all(
      Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => {
        const url = await getSignedUrl(
          this.client,
          new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }),
          { expiresIn: PART_URL_TTL_SECONDS },
        );
        return { partNumber, url };
      }),
    );

    return { uploadId, parts };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.eTag })) },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  async headObject(key: string): Promise<HeadResult | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: result.ContentLength ?? 0 };
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  async getSignedGetUrl(
    key: string,
    options: { expiresInSeconds: number; asAttachment: boolean; filename?: string },
  ): Promise<string> {
    const disposition = options.asAttachment
      ? `attachment${options.filename ? `; filename="${options.filename}"` : ''}`
      : 'inline';
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  async getSignedPutUrl(key: string, options: { expiresInSeconds: number; contentType: string }): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: options.contentType }), {
      expiresIn: options.expiresInSeconds,
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
