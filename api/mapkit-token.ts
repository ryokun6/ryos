import { SignJWT, importPKCS8 } from "jose";
import { apiHandler } from "./_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const RESPONSE_CACHE_SECONDS = 5 * 60; // 5 minutes — clients may reuse the same JWT

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

// In-memory cache shared across requests on the same server instance. The token
// itself has a 30-minute TTL; we re-sign well before expiry so MapKit never
// receives a token that's about to expire.
let cachedToken: CachedToken | null = null;

interface PrivateKeyParseResult {
  pem: string | null;
  reason?: string;
  rawLength?: number;
  bodyLength?: number;
  hasBeginMarker?: boolean;
  hasEndMarker?: boolean;
  invalidCharSample?: string;
}

function parsePrivateKey(): PrivateKeyParseResult {
  const raw = process.env.MAPKIT_PRIVATE_KEY;
  if (!raw || raw.trim().length === 0) {
    return { pem: null, reason: "env var empty or unset" };
  }

  // The .p8 file is a PKCS#8 PEM. We accept any of the common ways it gets
  // pasted into a host env UI: multi-line PEM, single-line w/ "\n" escapes,
  // doubly-escaped "\\n" (e.g. Coolify), or just the raw base64 body. We
  // normalize to a strict PEM with `\n` between lines and 64-char-wrapped
  // base64, which is what jose.importPKCS8 expects.
  const body = raw
    .replace(/\\\\n/g, "\n") // doubly-escaped \\n (Coolify stores this way)
    .replace(/\\\\r\\\\n/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n") // singly-escaped \n
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
      .replace(/\\/g, ""); // strip any stray backslashes from over-escaping
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

function readPrivateKey(): string | null {
  return parsePrivateKey().pem;
}

function listMissingEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.MAPKIT_TEAM_ID) missing.push("MAPKIT_TEAM_ID");
  if (!process.env.MAPKIT_KEY_ID) missing.push("MAPKIT_KEY_ID");
  if (!readPrivateKey()) missing.push("MAPKIT_PRIVATE_KEY");
  return missing;
}

async function signMapKitToken(): Promise<CachedToken> {
  const teamId = process.env.MAPKIT_TEAM_ID!;
  const keyId = process.env.MAPKIT_KEY_ID!;
  const privateKeyPem = readPrivateKey()!;
  const allowedOrigin = process.env.MAPKIT_ORIGIN?.trim();

  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;

  const builder = new SignJWT({
    ...(allowedOrigin ? { origin: allowedOrigin } : {}),
  })
    .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(exp);

  const token = await builder.sign(privateKey);

  return {
    token,
    expiresAt: exp * 1000,
  };
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ res, logger, startTime }) => {
    const missing = listMissingEnv();
    if (missing.length > 0) {
      // When the only "missing" thing is MAPKIT_PRIVATE_KEY but the env var
      // is actually set, surface why parsing failed so the operator can fix
      // the env value without redeploying with extra logs.
      const keyDiagnostics =
        missing.includes("MAPKIT_PRIVATE_KEY") &&
        process.env.MAPKIT_PRIVATE_KEY
          ? parsePrivateKey()
          : undefined;
      logger.warn("MapKit token endpoint missing env vars", {
        missing,
        keyDiagnostics,
      });
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "MapKit not configured",
        missing,
        ...(keyDiagnostics
          ? {
              privateKey: {
                reason: keyDiagnostics.reason,
                rawLength: keyDiagnostics.rawLength,
                bodyLength: keyDiagnostics.bodyLength,
                hasBeginMarker: keyDiagnostics.hasBeginMarker,
                hasEndMarker: keyDiagnostics.hasEndMarker,
                invalidCharSample: keyDiagnostics.invalidCharSample,
              },
            }
          : {}),
      });
      return;
    }

    try {
      const safetyBufferMs = 60_000; // refresh if <60s remaining
      const now = Date.now();
      if (!cachedToken || cachedToken.expiresAt - now < safetyBufferMs) {
        cachedToken = await signMapKitToken();
        logger.info("Signed new MapKit JWT", {
          expiresAt: new Date(cachedToken.expiresAt).toISOString(),
        });
      }

      res.setHeader(
        "Cache-Control",
        `private, max-age=${RESPONSE_CACHE_SECONDS}`
      );
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        token: cachedToken.token,
        expiresAt: cachedToken.expiresAt,
      });
    } catch (error) {
      logger.error("Failed to sign MapKit token", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "Failed to sign MapKit token",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
