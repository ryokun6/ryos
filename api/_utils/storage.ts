import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { del as deleteBlob, head as headBlob } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export type StorageBackend = "vercel-blob" | "s3";

export interface StorageObjectMetadata {
  size: number;
  contentType: string | null;
}

export interface StorageUploadOptions {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  allowedContentTypes?: string[];
  allowOverwrite?: boolean;
}

interface BaseStorageUploadDescriptor {
  provider: StorageBackend;
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
}

export interface VercelBlobUploadDescriptor extends BaseStorageUploadDescriptor {
  provider: "vercel-blob";
  uploadMethod: "vercel-client-token";
  clientToken: string;
}

export interface S3UploadDescriptor extends BaseStorageUploadDescriptor {
  provider: "s3";
  uploadMethod: "presigned-put";
  uploadUrl: string;
  storageUrl: string;
  headers: Record<string, string>;
}

export type StorageUploadDescriptor =
  | VercelBlobUploadDescriptor
  | S3UploadDescriptor;

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
  forcePathStyle: boolean;
}

const s3ClientCache = globalThis as typeof globalThis & {
  __ryosS3Client?: S3Client;
};

function getBlobReadWriteToken(): string | null {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/^\/+/, "");
}

function normalizeExplicitProvider(): string | null {
  const explicit = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  return explicit || null;
}

function isTruthy(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function getS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken =
    process.env.S3_SESSION_TOKEN?.trim() ||
    process.env.AWS_SESSION_TOKEN?.trim() ||
    null;

  if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    forcePathStyle: isTruthy(process.env.S3_FORCE_PATH_STYLE),
  };
}

function getS3Client(): S3Client {
  if (!s3ClientCache.__ryosS3Client) {
    const config = getS3Config();
    if (!config) {
      throw new Error(
        "Missing S3-compatible storage configuration. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
      );
    }

    s3ClientCache.__ryosS3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
      },
    });
  }

  return s3ClientCache.__ryosS3Client;
}

function toS3StorageUrl(pathname: string): string {
  const config = getS3Config();
  if (!config) {
    throw new Error(
      "Missing S3-compatible storage configuration. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  return `s3://${config.bucket}/${normalizePathname(pathname)}`;
}

function parseS3StorageUrl(storageUrl: string): { bucket: string; key: string } {
  if (!storageUrl.startsWith("s3://")) {
    throw new Error(`Invalid S3 storage URL: ${storageUrl}`);
  }

  const withoutScheme = storageUrl.slice("s3://".length);
  const separatorIndex = withoutScheme.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === withoutScheme.length - 1) {
    throw new Error(`Invalid S3 storage URL: ${storageUrl}`);
  }

  return {
    bucket: withoutScheme.slice(0, separatorIndex),
    key: withoutScheme.slice(separatorIndex + 1),
  };
}

function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: string;
    Code?: string;
    code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  const errorName = candidate.name || candidate.Code || candidate.code;
  return (
    errorName === "NotFound" ||
    errorName === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

async function readResponseBody(body: unknown): Promise<Uint8Array> {
  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  if (body instanceof Blob) {
    return new Uint8Array(await body.arrayBuffer());
  }

  if (body instanceof ReadableStream) {
    return new Uint8Array(await new Response(body).arrayBuffer());
  }

  const maybeTransformingBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };

  if (typeof maybeTransformingBody.transformToByteArray === "function") {
    return await maybeTransformingBody.transformToByteArray();
  }

  const maybeAsyncIterable = body as AsyncIterable<Uint8Array | Buffer | string>;
  if (Symbol.asyncIterator in Object(body)) {
    const chunks: Uint8Array[] = [];

    for await (const chunk of maybeAsyncIterable) {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
        continue;
      }

      chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
    }

    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  throw new Error("Unsupported storage download body type.");
}

export function getStorageBackend(): StorageBackend {
  const explicit = normalizeExplicitProvider();

  if (
    explicit === "vercel-blob" ||
    explicit === "vercel" ||
    explicit === "blob"
  ) {
    if (!getBlobReadWriteToken()) {
      throw new Error(
        "STORAGE_PROVIDER requests Vercel Blob, but BLOB_READ_WRITE_TOKEN is not set."
      );
    }
    return "vercel-blob";
  }

  if (
    explicit === "s3" ||
    explicit === "s3-compatible" ||
    explicit === "minio" ||
    explicit === "r2"
  ) {
    if (!getS3Config()) {
      throw new Error(
        "STORAGE_PROVIDER requests S3-compatible storage, but S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are not all set."
      );
    }
    return "s3";
  }

  if (getBlobReadWriteToken()) {
    return "vercel-blob";
  }

  if (getS3Config()) {
    return "s3";
  }

  throw new Error(
    "Missing storage configuration. Set BLOB_READ_WRITE_TOKEN for Vercel Blob or S3_BUCKET + S3_REGION + S3_ENDPOINT + S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY for S3-compatible storage."
  );
}

export async function createStorageUploadDescriptor(
  options: StorageUploadOptions
): Promise<StorageUploadDescriptor> {
  const pathname = normalizePathname(options.pathname);

  if (getStorageBackend() === "vercel-blob") {
    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname,
      allowedContentTypes: options.allowedContentTypes || [options.contentType],
      maximumSizeInBytes: options.maximumSizeInBytes,
      addRandomSuffix: false,
      allowOverwrite: options.allowOverwrite ?? true,
    });

    return {
      provider: "vercel-blob",
      uploadMethod: "vercel-client-token",
      pathname,
      contentType: options.contentType,
      maximumSizeInBytes: options.maximumSizeInBytes,
      clientToken,
    };
  }

  const uploadUrl = await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: getS3Config()!.bucket,
      Key: pathname,
      ContentType: options.contentType,
    }),
    { expiresIn: 60 }
  );

  return {
    provider: "s3",
    uploadMethod: "presigned-put",
    pathname,
    contentType: options.contentType,
    maximumSizeInBytes: options.maximumSizeInBytes,
    uploadUrl,
    storageUrl: toS3StorageUrl(pathname),
    headers: {
      "Content-Type": options.contentType,
    },
  };
}

export async function headStoredObject(
  storageUrl: string
): Promise<StorageObjectMetadata | null> {
  if (storageUrl.startsWith("s3://")) {
    try {
      const { bucket, key } = parseS3StorageUrl(storageUrl);
      const result = await getS3Client().send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );

      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
      };
    } catch (error) {
      if (isMissingObjectError(error)) {
        return null;
      }
      throw error;
    }
  }

  try {
    const blobInfo = await headBlob(storageUrl);
    return {
      size: blobInfo.size,
      contentType: blobInfo.contentType || null,
    };
  } catch (error) {
    if (isMissingObjectError(error)) {
      return null;
    }
    return null;
  }
}

export async function deleteStoredObject(storageUrl: string): Promise<void> {
  if (storageUrl.startsWith("s3://")) {
    const { bucket, key } = parseS3StorageUrl(storageUrl);
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return;
  }

  await deleteBlob(storageUrl);
}

export async function downloadStoredObject(
  storageUrl: string
): Promise<Uint8Array> {
  if (storageUrl.startsWith("s3://")) {
    const { bucket, key } = parseS3StorageUrl(storageUrl);
    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return await readResponseBody(result.Body);
  }

  const response = await fetch(storageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch stored object: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function createSignedDownloadUrl(
  storageUrl: string
): Promise<string> {
  if (!storageUrl.startsWith("s3://")) {
    return storageUrl;
  }

  const { bucket, key } = parseS3StorageUrl(storageUrl);
  return await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 300 }
  );
}
