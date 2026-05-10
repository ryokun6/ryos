import { apiHandler } from "./_utils/api-handler.js";
import {
  listMusicKitMissingEnv,
  parseMusicKitPrivateKey,
  signMusicKitJwt,
} from "./_utils/_musickit-jwt.js";
import type { MapKitSignedJwt } from "./_utils/_mapkit-jwt.js";

export const runtime = "nodejs";
export const maxDuration = 10;

// MusicKit dev tokens may live up to 6 months. We use 7 days here to limit
// blast radius if a token leaks; the in-memory cache prevents excess signing.
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESPONSE_CACHE_SECONDS = 30 * 60; // browsers may reuse JWT for 30m

let cachedToken: MapKitSignedJwt | null = null;

export default apiHandler(
  { methods: ["GET"] },
  async ({ res, logger, startTime }) => {
    const missing = listMusicKitMissingEnv();
    if (missing.length > 0) {
      const keyDiagnostics =
        missing.includes("MUSICKIT_PRIVATE_KEY") &&
        (process.env.MUSICKIT_PRIVATE_KEY || process.env.MAPKIT_PRIVATE_KEY)
          ? parseMusicKitPrivateKey()
          : undefined;
      logger.warn("MusicKit token endpoint missing env vars", {
        missing,
        keyDiagnostics,
      });
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "MusicKit not configured",
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
      const safetyBufferMs = 60 * 60 * 1000; // refresh if <1h remaining
      const now = Date.now();
      if (!cachedToken || cachedToken.expiresAt - now < safetyBufferMs) {
        cachedToken = await signMusicKitJwt(TOKEN_TTL_SECONDS);
        logger.info("Signed new MusicKit JWT", {
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
      logger.error("Failed to sign MusicKit token", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({
        error: "Failed to sign MusicKit token",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
);
