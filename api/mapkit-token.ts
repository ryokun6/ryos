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

function readPrivateKey(): string | null {
  const raw = process.env.MAPKIT_PRIVATE_KEY;
  if (!raw || raw.trim().length === 0) return null;

  // The .p8 file is a PKCS#8 PEM. We accept any of the common ways it gets
  // pasted into a host env UI:
  //   1. Multi-line PEM with real newlines (Vercel UI multi-line paste).
  //   2. Single-line value with literal "\n" or "\r\n" escapes (CLI/.env style).
  //   3. Doubly-escaped "\\n" sequences (some pipelines escape on save).
  //   4. Just the raw base64 body, with no BEGIN/END markers.
  //
  // We normalize all of those into a strict PEM with `\n` between lines and a
  // 64-char-wrapped base64 body, which is what `jose.importPKCS8` expects.
  let body = raw
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
      .replace(/\s+/g, "");
  } else {
    base64Body = body.replace(/\s+/g, "");
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(base64Body) || base64Body.length === 0) {
    return null;
  }

  const wrapped = base64Body.match(/.{1,64}/g)?.join("\n") ?? base64Body;
  return `${header}\n${wrapped}\n${footer}\n`;
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
      logger.warn("MapKit token endpoint missing env vars", { missing });
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "MapKit not configured",
        missing,
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
