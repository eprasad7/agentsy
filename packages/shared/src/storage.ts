// S3-compatible storage client for Tigris (Fly-native object storage)

import {
  GetObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export function getStorageConfig(): StorageConfig {
  return {
    endpoint: process.env['AWS_ENDPOINT_URL_S3'] ?? 'http://localhost:9000',
    region: process.env['AWS_REGION'] ?? 'auto',
    bucket: process.env['BUCKET_NAME'] ?? 'agentsy-storage',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
  };
}

/** S3-compatible client (Tigris, MinIO, R2). Uses path-style URLs for broad compatibility. */
export function createStorageClient(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

export async function putStorageObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: PutObjectCommandInput['Body'],
  contentType?: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getStorageObjectBytes(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<Uint8Array> {
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await out.Body?.transformToByteArray();
  if (!bytes) {
    throw new Error(`Empty or missing body for s3://${bucket}/${key}`);
  }
  return bytes;
}
