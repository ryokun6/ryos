import { REDIS_PREFIXES } from "./constants.js";
import type { Redis } from "./redis.js";

const MIN_MUSIC_USER_TOKEN_LENGTH = 16;
const MAX_MUSIC_USER_TOKEN_LENGTH = 4096;

export interface MusicKitUserTokenRecord {
  version: 1;
  token: string;
  updatedAt: string;
  lastValidatedAt?: string;
}

export function getMusicKitUserTokenKey(username: string): string {
  return `${REDIS_PREFIXES.appleMusicUserToken}${encodeURIComponent(username)}`;
}

export function normalizeMusicUserToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (
    token.length < MIN_MUSIC_USER_TOKEN_LENGTH ||
    token.length > MAX_MUSIC_USER_TOKEN_LENGTH ||
    /\s/.test(token)
  ) {
    return null;
  }
  return token;
}

function parseMusicKitUserTokenRecord(
  raw: string | MusicKitUserTokenRecord | null
): MusicKitUserTokenRecord | null {
  if (!raw) return null;

  let parsed: Partial<MusicKitUserTokenRecord>;
  try {
    parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<MusicKitUserTokenRecord>)
        : raw;
  } catch {
    return null;
  }

  const token = normalizeMusicUserToken(parsed.token);
  if (!token) return null;

  return {
    version: 1,
    token,
    updatedAt:
      typeof parsed.updatedAt === "string"
        ? parsed.updatedAt
        : new Date(0).toISOString(),
    ...(typeof parsed.lastValidatedAt === "string"
      ? { lastValidatedAt: parsed.lastValidatedAt }
      : {}),
  };
}

export async function getMusicKitUserToken(
  redis: Redis,
  username: string
): Promise<MusicKitUserTokenRecord | null> {
  const raw = await redis.get<string | MusicKitUserTokenRecord>(
    getMusicKitUserTokenKey(username)
  );
  return parseMusicKitUserTokenRecord(raw);
}

export async function storeMusicKitUserToken(
  redis: Redis,
  username: string,
  token: string
): Promise<MusicKitUserTokenRecord> {
  const normalized = normalizeMusicUserToken(token);
  if (!normalized) {
    throw new Error("Invalid Apple Music user token");
  }

  const record: MusicKitUserTokenRecord = {
    version: 1,
    token: normalized,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(getMusicKitUserTokenKey(username), JSON.stringify(record));
  return record;
}

export async function markMusicKitUserTokenValidated(
  redis: Redis,
  username: string
): Promise<MusicKitUserTokenRecord | null> {
  const existing = await getMusicKitUserToken(redis, username);
  if (!existing) return null;

  const record: MusicKitUserTokenRecord = {
    ...existing,
    lastValidatedAt: new Date().toISOString(),
  };
  await redis.set(getMusicKitUserTokenKey(username), JSON.stringify(record));
  return record;
}

export async function deleteMusicKitUserToken(
  redis: Redis,
  username: string
): Promise<void> {
  await redis.del(getMusicKitUserTokenKey(username));
}
