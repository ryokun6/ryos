import type { CryptoKey } from "jose";
import {
  importApplePrivateKey,
  parseApplePrivateKey,
  signAppleJwt,
  type ApplePrivateKeyParseResult,
  type AppleSignedJwt,
} from "./apple-jwt.js";

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

export function parseMapKitPrivateKey(): ApplePrivateKeyParseResult {
  return parseApplePrivateKey(process.env.MAPKIT_PRIVATE_KEY);
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

export type MapKitSignedJwt = AppleSignedJwt;

let cachedPrivateKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedPrivateKey) return cachedPrivateKey;
  const pem = readMapKitPrivateKey();
  if (!pem) throw new Error("MAPKIT_PRIVATE_KEY is not configured");
  cachedPrivateKey = await importApplePrivateKey(pem);
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
  const allowedOrigin = process.env.MAPKIT_ORIGIN?.trim();
  const payload =
    kind === "mapkit-js" && allowedOrigin ? { origin: allowedOrigin } : {};

  return signAppleJwt({
    payload,
    privateKey,
    teamId,
    keyId,
    ttlSeconds,
  });
}
