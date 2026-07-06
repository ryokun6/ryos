import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 60;

export interface StorageUploadTokenClaims {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  exp: number;
}

function getStorageUploadSigningKey(): string {
  const explicit = process.env.STORAGE_UPLOAD_SIGNING_KEY?.trim();
  if (explicit) return explicit;

  const s3Secret = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (s3Secret) return s3Secret;

  const redisToken = process.env.REDIS_KV_REST_API_TOKEN?.trim();
  if (redisToken) return redisToken;

  throw new Error(
    "Missing storage upload signing key. Set STORAGE_UPLOAD_SIGNING_KEY or configure S3/Redis credentials."
  );
}

function encodePayload(claims: StorageUploadTokenClaims): string {
  return Buffer.from(JSON.stringify(claims)).toString("base64url");
}

function decodePayload(encoded: string): StorageUploadTokenClaims | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<StorageUploadTokenClaims>;

    if (
      typeof parsed.pathname !== "string" ||
      parsed.pathname.length === 0 ||
      typeof parsed.contentType !== "string" ||
      parsed.contentType.length === 0 ||
      typeof parsed.maximumSizeInBytes !== "number" ||
      !Number.isFinite(parsed.maximumSizeInBytes) ||
      parsed.maximumSizeInBytes <= 0 ||
      typeof parsed.exp !== "number" ||
      !Number.isFinite(parsed.exp)
    ) {
      return null;
    }

    return {
      pathname: parsed.pathname.replace(/^\/+/, ""),
      contentType: parsed.contentType,
      maximumSizeInBytes: parsed.maximumSizeInBytes,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export async function signStorageUploadToken(options: {
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
  expiresInSeconds?: number;
}): Promise<string> {
  const pathname = options.pathname.replace(/^\/+/, "");
  const claims: StorageUploadTokenClaims = {
    pathname,
    contentType: options.contentType,
    maximumSizeInBytes: options.maximumSizeInBytes,
    exp:
      Math.floor(Date.now() / 1000) +
      (options.expiresInSeconds ?? TOKEN_TTL_SECONDS),
  };

  const payload = encodePayload(claims);
  const signature = createHmac("sha256", getStorageUploadSigningKey())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyStorageUploadToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): StorageUploadTokenClaims | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", getStorageUploadSigningKey())
    .update(payload)
    .digest("base64url");

  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    provided.length !== expectedBuffer.length ||
    !timingSafeEqual(provided, expectedBuffer)
  ) {
    return null;
  }

  const claims = decodePayload(payload);
  if (!claims || claims.exp < nowSeconds) {
    return null;
  }

  return claims;
}

export function isUploadPathOwnedByUser(
  pathname: string,
  username: string
): boolean {
  const syncPrefix = `sync/${username}/blobs/`;
  const backupPath = `backups/${username}/backup.gz`;
  const aiAttachmentPrefix = `ai/${username}/attachments/`;
  return (
    pathname.startsWith(syncPrefix) ||
    pathname === backupPath ||
    pathname.startsWith(aiAttachmentPrefix)
  );
}
