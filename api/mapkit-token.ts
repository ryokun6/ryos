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
  // Support PEM stored as a single-line env var with literal "\n" escape
  // sequences (common in Vercel/Bun env UIs) as well as real newlines.
  const normalized = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return normalized.trim();
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
