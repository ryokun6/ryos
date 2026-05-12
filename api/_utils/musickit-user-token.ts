import type { Redis } from "./redis.js";

export interface StoredMusicKitUserToken {
  token: string;
  updatedAt: string;
}

export const MUSICKIT_USER_TOKEN_MAX_LENGTH = 8192;

export function musicKitUserTokenKey(username: string): string {
  return `musickit:user-token:${username.toLowerCase()}`;
}

export function normalizeMusicKitUserToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token || token.length > MUSICKIT_USER_TOKEN_MAX_LENGTH) return null;
  return token;
}

export function parseStoredMusicKitUserToken(
  raw: string | StoredMusicKitUserToken | null
): StoredMusicKitUserToken | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as Partial<StoredMusicKitUserToken>;
      const token = normalizeMusicKitUserToken(parsed.token);
      if (!token) return null;
      return {
        token,
        updatedAt:
          typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    } catch {
      const token = normalizeMusicKitUserToken(raw);
      return token ? { token, updatedAt: "" } : null;
    }
  }

  const token = normalizeMusicKitUserToken(raw.token);
  if (!token) return null;
  return {
    token,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export async function readMusicKitUserToken(
  redis: Redis,
  username: string
): Promise<StoredMusicKitUserToken | null> {
  const raw = await redis.get<string | StoredMusicKitUserToken>(
    musicKitUserTokenKey(username)
  );
  return parseStoredMusicKitUserToken(raw);
}

export async function saveMusicKitUserToken(
  redis: Redis,
  username: string,
  token: string
): Promise<StoredMusicKitUserToken> {
  const normalized = normalizeMusicKitUserToken(token);
  if (!normalized) {
    throw new Error("Invalid Apple Music user token");
  }

  const stored: StoredMusicKitUserToken = {
    token: normalized,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(musicKitUserTokenKey(username), JSON.stringify(stored));
  return stored;
}

export async function deleteMusicKitUserToken(
  redis: Redis,
  username: string
): Promise<void> {
  await redis.del(musicKitUserTokenKey(username));
}
