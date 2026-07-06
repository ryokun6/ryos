import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import {
  RequestChecksumCalculation,
  ResponseChecksumValidation,
} from "@aws-sdk/middleware-flexible-checksums";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  del as deleteBlob,
  get as getBlob,
  head as headBlob,
  put as putBlob,
} from "@vercel/blob";
import { signStorageUploadToken } from "./storage-upload-token.js";
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
  uploadMethod: "presigned-put" | "api-proxy-put";
  uploadUrl: string;
  storageUrl: string;
  headers: Record<string, string>;
}

export type StorageUploadDescriptor =
  | VercelBlobUploadDescriptor
  | S3UploadDescriptor;

export interface StorageUploadDebugInfo {
  provider: StorageBackend;
  uploadMethod: StorageUploadDescriptor["uploadMethod"];
  pathname: string;
  maximumSizeInBytes: number;
  contentType: string;
  storageUrlScheme?: string;
  storageBucket?: string;
  publicEndpoint?: string;
  sdkEndpoint?: string;
  forcePathStyle?: boolean;
  uploadUrl?: string;
  uploadUrlOrigin?: string;
}

interface S3Config {
  bucket: string;
  region: string;
  endpoint: string;
  publicEndpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | null;
  forcePathStyle: boolean;
}

const s3ClientCache = globalThis as typeof globalThis & {
  __ryosS3Client?: S3Client;
  __ryosS3PresignClient?: S3Client;
  __ryosS3ClientCacheKey?: string;
  __ryosS3PresignClientCacheKey?: string;
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

function isFalsy(value: string | undefined): boolean {
  return value === "0" || value?.toLowerCase() === "false";
}

function shouldUsePathStyle(explicit: string | undefined): boolean {
  if (isTruthy(explicit)) {
    return true;
  }

  if (isFalsy(explicit)) {
    return false;
  }

  return false;
}

function sanitizeUrlForLogs(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function getS3Config(): S3Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const publicEndpoint =
    process.env.S3_PUBLIC_ENDPOINT?.trim() || endpoint;
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

  if (
    !bucket ||
    !region ||
    !endpoint ||
    !publicEndpoint ||
    !accessKeyId ||
    !secretAccessKey
  ) {
    return null;
  }

  return {
    bucket,
    region,
    endpoint,
    publicEndpoint,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    forcePathStyle: shouldUsePathStyle(process.env.S3_FORCE_PATH_STYLE),
  };
}

export function shouldEnableStorageDebugLogs(): boolean {
  return isTruthy(process.env.STORAGE_DEBUG);
}

export type StorageClientUploadMode = "presigned" | "proxy";

export function getStorageClientUploadMode(): StorageClientUploadMode {
  const explicit = process.env.STORAGE_CLIENT_UPLOAD?.trim().toLowerCase();
  if (explicit === "proxy" || explicit === "api-proxy") {
    return "proxy";
  }
  return "presigned";
}

export function logStorageDebug(message: string, details?: unknown): void {
  if (!shouldEnableStorageDebugLogs()) {
    return;
  }

  console.log("[storage]", message, details ?? "");
}

function createS3Client(endpoint: string, forcePathStyle: boolean): S3Client {
  const config = getS3Config();
  if (!config) {
    throw new Error(
      "Missing S3-compatible storage configuration. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  const clientConfig: S3ClientConfig = {
    region: config.region,
    endpoint,
    forcePathStyle,
    // Match the boto3 object storage example more closely:
    // - virtual-hosted style unless explicitly forced to path-style
    // - only calculate request/response checksums when required so presigned
    //   PUT URLs stay minimal for S3-compatible providers
    requestChecksumCalculation: RequestChecksumCalculation.WHEN_REQUIRED,
    responseChecksumValidation: ResponseChecksumValidation.WHEN_REQUIRED,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      ...(config.sessionToken ? { sessionToken: config.sessionToken } : {}),
    },
  };

  return new S3Client(clientConfig);
}

function getS3ClientCacheKey(endpoint: string, forcePathStyle: boolean): string {
  const config = getS3Config();
  if (!config) {
    throw new Error(
      "Missing S3-compatible storage configuration. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  return JSON.stringify({
    region: config.region,
    endpoint,
    forcePathStyle,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    sessionToken: config.sessionToken,
  });
}

function getS3Client(): S3Client {
  const config = getS3Config();
  if (!config) {
    throw new Error(
      "Missing S3-compatible storage configuration. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  const cacheKey = getS3ClientCacheKey(config.endpoint, config.forcePathStyle);
  if (
    !s3ClientCache.__ryosS3Client ||
    s3ClientCache.__ryosS3ClientCacheKey !== cacheKey
  ) {
    s3ClientCache.__ryosS3Client = createS3Client(
      config.endpoint,
      config.forcePathStyle
    );
    s3ClientCache.__ryosS3ClientCacheKey = cacheKey;
  }

  return s3ClientCache.__ryosS3Client;
}

function getS3PresignClient(): S3Client {
  const config = getS3Config();
  if (!config) {
    throw new Error(
      "Missing S3-compatible storage configuration. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  const cacheKey = getS3ClientCacheKey(
    config.publicEndpoint,
    config.forcePathStyle
  );
  if (
    !s3ClientCache.__ryosS3PresignClient ||
    s3ClientCache.__ryosS3PresignClientCacheKey !== cacheKey
  ) {
    s3ClientCache.__ryosS3PresignClient = createS3Client(
      config.publicEndpoint,
      config.forcePathStyle
    );
    s3ClientCache.__ryosS3PresignClientCacheKey = cacheKey;
  }

  return s3ClientCache.__ryosS3PresignClient;
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

export function assertStoredObjectPath(
  storageUrl: string,
  expectedPathname: string
): void {
  const expected = normalizePathname(expectedPathname);
  if (storageUrl.startsWith("s3://")) {
    const config = getS3Config();
    const { bucket, key } = parseS3StorageUrl(storageUrl);
    if (!config || bucket !== config.bucket || key !== expected) {
      throw new Error("Stored object location does not match its owner.");
    }
    return;
  }

  try {
    const parsed = new URL(storageUrl);
    const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== "blob.vercel-storage.com" &&
        !parsed.hostname.endsWith(".blob.vercel-storage.com")) ||
      parsed.search ||
      parsed.hash ||
      pathname !== expected
    ) {
      throw new Error("Stored object location does not match its owner.");
    }
  } catch {
    throw new Error("Stored object location does not match its owner.");
  }
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

function assertDownloadWithinLimit(
  size: number,
  maximumSizeInBytes: number | undefined
): void {
  if (
    maximumSizeInBytes !== undefined &&
    size > maximumSizeInBytes
  ) {
    throw new Error("Stored object exceeds the allowed download size.");
  }
}

function combineDownloadChunks(
  chunks: readonly Uint8Array[],
  totalLength: number
): Uint8Array {
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

async function readResponseBody(
  body: unknown,
  maximumSizeInBytes?: number
): Promise<Uint8Array> {
  if (!body) {
    return new Uint8Array();
  }

  if (body instanceof Uint8Array) {
    assertDownloadWithinLimit(body.byteLength, maximumSizeInBytes);
    return body;
  }

  if (body instanceof ArrayBuffer) {
    assertDownloadWithinLimit(body.byteLength, maximumSizeInBytes);
    return new Uint8Array(body);
  }

  if (body instanceof Blob) {
    assertDownloadWithinLimit(body.size, maximumSizeInBytes);
    return new Uint8Array(await body.arrayBuffer());
  }

  if (body instanceof ReadableStream) {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalLength += value.byteLength;
        assertDownloadWithinLimit(totalLength, maximumSizeInBytes);
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return combineDownloadChunks(chunks, totalLength);
  }

  const maybeAsyncIterable = body as AsyncIterable<Uint8Array | Buffer | string>;
  if (Symbol.asyncIterator in Object(body)) {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    for await (const chunk of maybeAsyncIterable) {
      const bytes =
        typeof chunk === "string"
          ? new TextEncoder().encode(chunk)
          : chunk instanceof Uint8Array
            ? chunk
            : new Uint8Array(chunk);
      totalLength += bytes.byteLength;
      assertDownloadWithinLimit(totalLength, maximumSizeInBytes);
      chunks.push(bytes);
    }

    return combineDownloadChunks(chunks, totalLength);
  }

  const maybeTransformingBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };
  if (typeof maybeTransformingBody.transformToByteArray === "function") {
    const bytes = await maybeTransformingBody.transformToByteArray();
    assertDownloadWithinLimit(bytes.byteLength, maximumSizeInBytes);
    return bytes;
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

  if (getStorageClientUploadMode() === "proxy") {
    return createS3ProxyUploadDescriptor(options);
  }

  const uploadUrl = await getSignedUrl(
    getS3PresignClient(),
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

async function createS3ProxyUploadDescriptor(
  options: StorageUploadOptions
): Promise<S3UploadDescriptor> {
  const pathname = normalizePathname(options.pathname);
  const token = await signStorageUploadToken({
    pathname,
    contentType: options.contentType,
    maximumSizeInBytes: options.maximumSizeInBytes,
  });
  const params = new URLSearchParams({ token });

  return {
    provider: "s3",
    uploadMethod: "api-proxy-put",
    pathname,
    contentType: options.contentType,
    maximumSizeInBytes: options.maximumSizeInBytes,
    uploadUrl: `/api/sync/v2/blob-upload?${params.toString()}`,
    storageUrl: toS3StorageUrl(pathname),
    headers: {
      "Content-Type": options.contentType,
    },
  };
}

export async function uploadStoredObject(options: {
  pathname: string;
  contentType: string;
  body: Uint8Array | Buffer;
}): Promise<void> {
  if (getStorageBackend() !== "s3") {
    throw new Error("uploadStoredObject requires S3-compatible storage.");
  }

  const pathname = normalizePathname(options.pathname);
  const config = getS3Config();
  if (!config) {
    throw new Error("Missing object-storage configuration.");
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: pathname,
      Body: options.body,
      ContentType: options.contentType,
    })
  );
}

export async function uploadPrivateStoredObject(options: {
  pathname: string;
  contentType: string;
  body: Uint8Array | Buffer;
  maximumSizeInBytes: number;
}): Promise<string> {
  const pathname = normalizePathname(options.pathname);
  assertDownloadWithinLimit(
    options.body.byteLength,
    options.maximumSizeInBytes
  );

  if (getStorageBackend() === "vercel-blob") {
    const uploaded = await putBlob(pathname, options.body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: options.contentType,
      maximumSizeInBytes: options.maximumSizeInBytes,
    });
    return uploaded.url;
  }

  const config = getS3Config();
  if (!config) {
    throw new Error("Missing object-storage configuration.");
  }
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: pathname,
      Body: options.body,
      ContentType: options.contentType,
      IfNoneMatch: "*",
    })
  );
  return toS3StorageUrl(pathname);
}

export function getStorageUploadDebugInfo(
  descriptor: StorageUploadDescriptor
): StorageUploadDebugInfo {
  if (descriptor.provider === "vercel-blob") {
    return {
      provider: descriptor.provider,
      uploadMethod: descriptor.uploadMethod,
      pathname: descriptor.pathname,
      maximumSizeInBytes: descriptor.maximumSizeInBytes,
      contentType: descriptor.contentType,
    };
  }

  const config = getS3Config();

  return {
    provider: descriptor.provider,
    uploadMethod: descriptor.uploadMethod,
    pathname: descriptor.pathname,
    maximumSizeInBytes: descriptor.maximumSizeInBytes,
    contentType: descriptor.contentType,
    storageUrlScheme: "s3",
    storageBucket: config?.bucket,
    publicEndpoint: config?.publicEndpoint,
    sdkEndpoint: config?.endpoint,
    forcePathStyle: config?.forcePathStyle,
    uploadUrl: sanitizeUrlForLogs(descriptor.uploadUrl),
    uploadUrlOrigin: (() => {
      try {
        return new URL(descriptor.uploadUrl).origin;
      } catch {
        return undefined;
      }
    })(),
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

export async function deleteStoredObjectByPathname(
  pathname: string,
  provider: StorageBackend
): Promise<void> {
  const normalized = normalizePathname(pathname);
  if (provider === "s3") {
    await deleteStoredObject(toS3StorageUrl(normalized));
    return;
  }
  await deleteBlob(normalized);
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

export async function downloadPrivateStoredObject(
  storageUrl: string,
  maximumSizeInBytes: number
): Promise<Uint8Array> {
  if (storageUrl.startsWith("s3://")) {
    const { bucket, key } = parseS3StorageUrl(storageUrl);
    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (
      typeof result.ContentLength === "number" &&
      result.ContentLength > maximumSizeInBytes
    ) {
      throw new Error("Stored object exceeds the allowed download size.");
    }
    return await readResponseBody(result.Body, maximumSizeInBytes);
  }

  const result = await getBlob(storageUrl, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new Error("Stored object was not found.");
  }
  assertDownloadWithinLimit(result.blob.size, maximumSizeInBytes);
  return await readResponseBody(result.stream, maximumSizeInBytes);
}

export async function createSignedDownloadUrl(
  storageUrl: string
): Promise<string> {
  if (!storageUrl.startsWith("s3://")) {
    return storageUrl;
  }

  const { bucket, key } = parseS3StorageUrl(storageUrl);
  return await getSignedUrl(
    getS3PresignClient(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 300 }
  );
}
