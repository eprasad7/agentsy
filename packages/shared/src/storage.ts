// S3-compatible storage client for Tigris (Fly-native object storage)
// Will be connected to actual Tigris bucket in production

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
