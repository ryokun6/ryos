import type { IncomingHttpHeaders } from "node:http";

export type PushPlatform = "ios" | "android";

export interface PushTokenMetadata {
  username: string;
  platform: PushPlatform;
  updatedAt: number;
}

export const PUSH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

const PUSH_TOKEN_REGEX = /^[A-Za-z0-9:_\-.]{20,512}$/;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRequestBodyObject(
  body: unknown
): Record<string, unknown> | null {
  if (typeof body === "undefined" || body === null) {
    return {};
  }
  if (!isPlainObject(body)) return null;
  return body;
}

export interface ParsedStoredPushTokens {
  validTokens: string[];
  invalidTokensToRemove: string[];
  skippedNonStringCount: number;
}

export function parseStoredPushTokens(rawValue: unknown): ParsedStoredPushTokens {
  if (!Array.isArray(rawValue)) {
    return {
      validTokens: [],
      invalidTokensToRemove: [],
      skippedNonStringCount: 0,
    };
  }

  const validTokensSet = new Set<string>();
  const invalidTokensSet = new Set<string>();
  let skippedNonStringCount = 0;

  for (const entry of rawValue) {
    if (typeof entry !== "string") {
      skippedNonStringCount += 1;
      continue;
    }

    if (isValidPushToken(entry)) {
      validTokensSet.add(entry);
      continue;
    }

    invalidTokensSet.add(entry);
  }

  return {
    validTokens: Array.from(validTokensSet),
    invalidTokensToRemove: Array.from(invalidTokensSet),
    skippedNonStringCount,
  };
}

export function getUserTokensKey(username: string): string {
  return `push:user:${username}:tokens`;
}

export function getTokenMetaKey(token: string): string {
  return `push:token:${token}`;
}

export function getPushTokenSuffix(token: string, suffixLength: number = 8): string {
  if (typeof token !== "string" || token.length === 0) {
    return "";
  }

  if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
    return "";
  }

  return token.slice(-suffixLength);
}

export function isValidPushToken(token: string): boolean {
  return PUSH_TOKEN_REGEX.test(token);
}

export function isPushPlatform(platform: string): platform is PushPlatform {
  return platform === "ios" || platform === "android";
}

export function normalizePushPlatform(value: unknown): PushPlatform | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isPushPlatform(normalized) ? normalized : null;
}

export function normalizeUsername(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function getOptionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function extractTokenMetadataOwner(
  metadata: Partial<PushTokenMetadata> | null | undefined
): string | null {
  return normalizeUsername(
    metadata && typeof metadata.username === "string" ? metadata.username : null
  );
}

export function isTokenMetadataOwnedByUser(
  metadata: Partial<PushTokenMetadata> | null | undefined,
  username: string
): boolean {
  return extractTokenMetadataOwner(metadata) === normalizeUsername(username);
}

export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (typeof authHeader !== "string") return null;

  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export function isRedisPositiveCount(value: unknown): boolean {
  return normalizeRedisNonNegativeCount(value, 0) > 0;
}

export function normalizeRedisNonNegativeCount(
  value: unknown,
  fallback: number = 0
): number {
  const normalizedFallback = Number.isSafeInteger(fallback) ? fallback : 0;

  // Normalizes common Redis client return shapes into non-negative counts.
  // Uses safe-integer bounds to avoid lossy numeric coercion.
  if (typeof value === "bigint") {
    if (value < 0n) return normalizedFallback;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return normalizedFallback;
    return Number(value);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      return normalizedFallback;
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return normalizedFallback;
    if (!/^\d+$/.test(trimmed)) return normalizedFallback;
    const parsed = Number(trimmed);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return normalizedFallback;
    }
    return parsed;
  }

  if (value === true) return 1;
  if (value === false) return 0;
  return normalizedFallback;
}

function readSingleHeader(
  headers: IncomingHttpHeaders,
  key: string
): string | undefined {
  const value = headers[key];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

export function extractAuthFromHeaders(
  headers: IncomingHttpHeaders
): { username: string | null; token: string | null } {
  const authHeader = readSingleHeader(headers, "authorization");
  const usernameHeader = readSingleHeader(headers, "x-username");

  return {
    username: normalizeUsername(usernameHeader),
    token: extractBearerToken(authHeader),
  };
}
