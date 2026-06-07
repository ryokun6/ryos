import { SignJWT, importPKCS8, type CryptoKey } from "jose";

import {
  parseApplePrivateKey,
  parseMapKitPrivateKey,
  type MapKitSignedJwt,
  type PrivateKeyParseResult,
} from "./_mapkit-jwt.js";

/**
 * MusicKit JS developer-token signer.
 *
 * MusicKit and MapKit both rely on Apple Developer ES256 JWTs (`.p8` keys
 * downloaded from `developer.apple.com`). The biggest differences are:
 *   1. MusicKit JWTs MUST have `aud: "music"` whereas MapKit tokens omit
 *      the `aud` claim and may instead use an `origin` claim.
 *   2. The Key ID issued from Apple is service-specific. We let operators
 *      configure dedicated MUSICKIT_* env vars; if a value is missing we
 *      fall back to MAPKIT_* so users that already have MapKit configured
 *      and reuse the same .p8 key only need to add MUSICKIT_KEY_ID.
 *
 * Apple's Apple Music API allows tokens with up to a 180-day TTL — we
 * cache an in-memory token and refresh well before expiry.
 */

export function parseMusicKitPrivateKey(): PrivateKeyParseResult {
  if (process.env.MUSICKIT_PRIVATE_KEY) {
    return parseApplePrivateKey(process.env.MUSICKIT_PRIVATE_KEY);
  }
  return parseMapKitPrivateKey();
}

function readMusicKitPrivateKey(): string | null {
  return parseMusicKitPrivateKey().pem;
}

function getTeamId(): string | undefined {
  return process.env.MUSICKIT_TEAM_ID || process.env.MAPKIT_TEAM_ID;
}

function getKeyId(): string | undefined {
  return process.env.MUSICKIT_KEY_ID || process.env.MAPKIT_KEY_ID;
}

export function listMusicKitMissingEnv(): string[] {
  const missing: string[] = [];
  if (!getTeamId()) missing.push("MUSICKIT_TEAM_ID");
  if (!getKeyId()) missing.push("MUSICKIT_KEY_ID");
  if (!readMusicKitPrivateKey()) missing.push("MUSICKIT_PRIVATE_KEY");
  return missing;
}

let cachedPrivateKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = readMusicKitPrivateKey();
  if (!pem) throw new Error("MUSICKIT_PRIVATE_KEY is not configured");
  cachedPrivateKey = await importPKCS8(pem, "ES256");
  return cachedPrivateKey;
}

/**
 * Sign an Apple Music / MusicKit JS developer token.
 */
export async function signMusicKitJwt(
  ttlSeconds: number
): Promise<MapKitSignedJwt> {
  const teamId = getTeamId();
  const keyId = getKeyId();
  if (!teamId) throw new Error("MUSICKIT_TEAM_ID is not configured");
  if (!keyId) throw new Error("MUSICKIT_KEY_ID is not configured");

  const privateKey = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const allowedOrigin = process.env.MUSICKIT_ORIGIN?.trim();
  const payload: Record<string, string> = {};
  if (allowedOrigin) payload.origin = allowedOrigin;

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return { token, expiresAt: exp * 1000 };
}
