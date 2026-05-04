import { SignJWT, importPKCS8, type CryptoKey } from "jose";

/**
 * Shared utilities for parsing the MapKit `.p8` private key and signing the
 * Apple-issued JWTs used by both client-facing MapKit JS (`/api/mapkit-token`)
 * and the server-to-server Apple Maps Server API (`/v1/token` -> `/v1/search`).
 *
 * The `.p8` env var is normalized to a strict PEM up front so we can call
 * `jose.importPKCS8` regardless of how the operator pasted the key into their
 * host's env UI (multi-line PEM, single-line `\n`, doubly-escaped `\\n`,
 * raw base64, etc.).
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

export function parseMapKitPrivateKey(): PrivateKeyParseResult {
  const raw = process.env.MAPKIT_PRIVATE_KEY;
  if (!raw || raw.trim().length === 0) {
    return { pem: null, reason: "env var empty or unset" };
  }

  const body = raw
    .replace(/\\\\n/g, "\n")
    .replace(/\\\\r\\\\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

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

export function readMapKitPrivateKey(): string | null {
  return parseMapKitPrivateKey().pem;
}

export function listMapKitMissingEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.MAPKIT_TEAM_ID) missing.push("MAPKIT_TEAM_ID");
  if (!process.env.MAPKIT_KEY_ID) missing.push("MAPKIT_KEY_ID");
  if (!readMapKitPrivateKey()) missing.push("MAPKIT_PRIVATE_KEY");
  return missing;
}

export type MapKitJwtKind = "mapkit-js" | "maps-server-api";

export interface MapKitSignedJwt {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedPrivateKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = readMapKitPrivateKey();
  if (!pem) throw new Error("MAPKIT_PRIVATE_KEY is not configured");
  cachedPrivateKey = await importPKCS8(pem, "ES256");
  return cachedPrivateKey;
}

/**
 * Sign a MapKit-style ES256 JWT.
 *
 * For `mapkit-js` we include an optional `origin` claim so that browsers must
 * load MapKit JS from `MAPKIT_ORIGIN`. For `maps-server-api` we deliberately
 * omit the `origin` claim — the server-side API rejects tokens that pin to a
 * browser origin.
 */
export async function signMapKitJwt(
  kind: MapKitJwtKind,
  ttlSeconds: number
): Promise<MapKitSignedJwt> {
  const teamId = process.env.MAPKIT_TEAM_ID;
  const keyId = process.env.MAPKIT_KEY_ID;
  if (!teamId) throw new Error("MAPKIT_TEAM_ID is not configured");
  if (!keyId) throw new Error("MAPKIT_KEY_ID is not configured");

  const privateKey = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const allowedOrigin = process.env.MAPKIT_ORIGIN?.trim();
  const payload =
    kind === "mapkit-js" && allowedOrigin ? { origin: allowedOrigin } : {};

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);

  return { token, expiresAt: exp * 1000 };
}
