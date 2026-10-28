/**
 * Anonymous karaoke lyrics generation allowance.
 *
 * Signed-out clients may generate lyrics for {@link ANON_KARAOKE_GENERATION_LIMIT}
 * distinct songs. The browser keeps a stable id in localStorage and sends it
 * as `anonClientId`. This module counts songs for that id in Redis. Requests
 * without a valid id stay blocked, matching the previous sign-in requirement.
 * Signed-in users never reach the counter.
 */

import { makeKey } from "../_utils/_rate-limit-key.js";

export const ANON_KARAOKE_GENERATION_LIMIT = 3;

const ANON_CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export type AnonSongQuotaRedis = {
  sadd(key: string, ...members: string[]): Promise<number>;
  scard(key: string): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
};

export function readAnonKaraokeClientId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { anonClientId?: unknown }).anonClientId;
  if (typeof value !== "string" || !ANON_CLIENT_ID_RE.test(value)) return null;
  return value;
}

export function anonKaraokeGenerationKey(clientId: string): string {
  return makeKey(["rl", "song", "anon-generate", "client", clientId]);
}

/**
 * Reserve `songId` against the anonymous client's free songs.
 * A song already in the set does not consume another slot, so translation,
 * furigana, and soramimi for the same track share one allowance.
 */
export async function claimAnonymousKaraokeSong(
  redis: AnonSongQuotaRedis,
  clientId: string,
  songId: string,
  limit = ANON_KARAOKE_GENERATION_LIMIT
): Promise<boolean> {
  if (!songId) return false;
  const key = anonKaraokeGenerationKey(clientId);
  const added = await redis.sadd(key, songId);
  const count = await redis.scard(key);
  if (count <= limit) return true;
  if (added > 0) {
    await redis.srem(key, songId);
  }
  return false;
}

/**
 * Whether this request may run a paid lyrics generation.
 * Signed-in users are always allowed (other rate limits still apply).
 * Anonymous users need a valid client id and a free song slot.
 */
export async function allowLyricsGeneration(input: {
  username: string | null;
  body: unknown;
  songId: string;
  claim: (clientId: string, songId: string) => Promise<boolean>;
}): Promise<boolean> {
  if (input.username) return true;
  const clientId = readAnonKaraokeClientId(input.body);
  if (!clientId) return false;
  return input.claim(clientId, input.songId);
}
