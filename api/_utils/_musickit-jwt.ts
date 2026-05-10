import { SignJWT, importPKCS8, type CryptoKey } from "jose";

import {
  parseMapKitPrivateKey,
  type MapKitSignedJwt,
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

interface PrivateKeyParseResult {
  pem: string | null;
  reason?: string;
  rawLength?: number;
  bodyLength?: number;
  hasBeginMarker?: boolean;
  hasEndMarker?: boolean;
  invalidCharSample?: string;
}

const NORMALIZE_PEM_MULTI = /\\\\n/g;
const NORMALIZE_PEM_CRLF_ESC = /\\\\r\\\\n/g;
const NORMALIZE_PEM_CRLF_ESC2 = /\\r\\n/g;
const NORMALIZE_PEM_NL_ESC = /\\n/g;

function normalizeRawPem(raw: string): string {
  return raw
    .replace(NORMALIZE_PEM_MULTI, "\n")
    .replace(NORMALIZE_PEM_CRLF_ESC, "\n")
    .replace(NORMALIZE_PEM_CRLF_ESC2, "\n")
    .replace(NORMALIZE_PEM_NL_ESC, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function parsePrivateKey(raw: string | undefined): PrivateKeyParseResult {
  if (!raw || raw.trim().length === 0) {
    return { pem: null, reason: "env var empty or unset" };
  }

  const body = normalizeRawPem(raw);
  const beginMatch = body.match(/-----BEGIN [A-Z0-9 ]+-----/);
  const endMatch = body.match(/-----END [A-Z0-9 ]+-----/);

  let header = "-----BEGIN PRIVATE KEY-----";
  let footer = "-----END PRIVATE KEY-----";
  let base64Body: string;

  if (beginMatch && endMatch) {
    header = beginMatch[0];
    footer = endMatch[0];
    base64Body = body
      .slice(beginMatch.index! + header.length, endMatch.index!)
      .replace(/\s+/g, "")
      .replace(/\\/g, "");
  } else {
    base64Body = body.replace(/\s+/g, "").replace(/\\/g, "");
  }

  if (base64Body.length === 0) {
    return {
      pem: null,
      reason: "no base64 body",
      rawLength: raw.length,
      bodyLength: body.length,
      hasBeginMarker: !!beginMatch,
      hasEndMarker: !!endMatch,
    };
  }

  const invalidChars = base64Body.match(/[^A-Za-z0-9+/=]/g);
  if (invalidChars && invalidChars.length > 0) {
    return {
      pem: null,
      reason: "base64 body contains non-base64 characters",
      rawLength: raw.length,
      bodyLength: base64Body.length,
      hasBeginMarker: !!beginMatch,
      hasEndMarker: !!endMatch,
      invalidCharSample: Array.from(new Set(invalidChars))
        .slice(0, 10)
        .map((c) => `0x${c.charCodeAt(0).toString(16)}`)
        .join(","),
    };
  }

  const wrapped = base64Body.match(/.{1,64}/g)?.join("\n") ?? base64Body;
  return { pem: `${header}\n${wrapped}\n${footer}\n` };
}

export function parseMusicKitPrivateKey(): PrivateKeyParseResult {
  // Prefer dedicated MusicKit env var; fall back to MapKit if same .p8 is reused.
  if (process.env.MUSICKIT_PRIVATE_KEY) {
    return parsePrivateKey(process.env.MUSICKIT_PRIVATE_KEY);
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
  cachedPrivateKey = await importPKCS8(pem, "ES256");
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
