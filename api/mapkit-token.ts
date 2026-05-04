import { apiHandler } from "./_utils/api-handler.js";
import {
  listMapKitMissingEnv,
  parseMapKitPrivateKey,
  signMapKitJwt,
  type MapKitSignedJwt,
} from "./_utils/_mapkit-jwt.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const RESPONSE_CACHE_SECONDS = 5 * 60; // 5 minutes — clients may reuse the same JWT

// In-memory cache shared across requests on the same server instance. The token
// itself has a 30-minute TTL; we re-sign well before expiry so MapKit never
// receives a token that's about to expire.
let cachedToken: MapKitSignedJwt | null = null;

export default apiHandler(
  { methods: ["GET"] },
  async ({ res, logger, startTime }) => {
    const missing = listMapKitMissingEnv();
    if (missing.length > 0) {
      // When the only "missing" thing is MAPKIT_PRIVATE_KEY but the env var
      // is actually set, surface why parsing failed so the operator can fix
      // the env value without redeploying with extra logs.
      const keyDiagnostics =
        missing.includes("MAPKIT_PRIVATE_KEY") &&
        process.env.MAPKIT_PRIVATE_KEY
          ? parseMapKitPrivateKey()
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
        cachedToken = await signMapKitJwt("mapkit-js", TOKEN_TTL_SECONDS);
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
