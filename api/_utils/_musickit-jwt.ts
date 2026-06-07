import type { CryptoKey } from "jose";

import {
  parseMapKitPrivateKey,
  type MapKitSignedJwt,
} from "./_mapkit-jwt.js";
import {
  importApplePrivateKey,
  parseApplePrivateKey,
  signAppleJwt,
  type ApplePrivateKeyParseResult,
} from "./apple-jwt.js";

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

export function parseMusicKitPrivateKey(): ApplePrivateKeyParseResult {
  // Prefer dedicated MusicKit env var; fall back to MapKit if same .p8 is reused.
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
  // A single .p8 key can have both MapKit and MusicKit enabled in the Apple
  // Developer portal — in that case the Key ID is the same. Fall back to
  // MAPKIT_KEY_ID to make the common "one shared key" setup work without
  // requiring duplicate env vars.
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
  cachedPrivateKey = await importApplePrivateKey(pem);
  return cachedPrivateKey;
}

/**
 * Sign an Apple Music / MusicKit JS developer token.
 *
 * Per Apple's "Getting Keys and Creating Tokens" guide
 * (https://developer.apple.com/documentation/applemusicapi/getting-keys-and-creating-tokens)
 * the standard claims are `iss` (Team ID), `iat`, and `exp`. We additionally
 * include the `origin` claim (when MUSICKIT_ORIGIN is set) so the issued
 * token can only be used from a trusted browser origin.
 *
 * @param ttlSeconds Lifetime in seconds. Apple caps at 15777000 ≈ 6 months.
 */
export async function signMusicKitJwt(
  ttlSeconds: number
): Promise<MapKitSignedJwt> {
  const teamId = getTeamId();
  const keyId = getKeyId();
  if (!teamId) throw new Error("MUSICKIT_TEAM_ID is not configured");
  if (!keyId) throw new Error("MUSICKIT_KEY_ID is not configured");

  const privateKey = await getPrivateKey();
  const allowedOrigin = process.env.MUSICKIT_ORIGIN?.trim();
  const payload: Record<string, string> = {};
  if (allowedOrigin) payload.origin = allowedOrigin;

  return signAppleJwt({
    payload,
    privateKey,
    teamId,
    keyId,
    ttlSeconds,
  });
}
