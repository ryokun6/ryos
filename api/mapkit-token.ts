import { apiHandler } from "./_utils/api-handler.js";
import {
  listMapKitMissingEnv,
  parseMapKitPrivateKey,
  resolveMapKitJsOrigin,
  signMapKitJwt,
  type MapKitSignedJwt,
} from "./_utils/_mapkit-jwt.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const TOKEN_TTL_SECONDS = 30 * 60;
const RESPONSE_CACHE_SECONDS = 5 * 60;
const SAFETY_BUFFER_MS = 60_000;

const tokenCache = new Map<string, MapKitSignedJwt>();

function cacheKeyForOrigin(origin: string | undefined): string {
  return origin ?? "__default__";
}

export default apiHandler({ methods: ["GET"] }, async ({ res, logger, startTime, origin }) => {
  const missing = listMapKitMissingEnv();
  if (missing.length > 0) {
    const keyDiagnostics =
      missing.includes("MAPKIT_PRIVATE_KEY") &&
      Boolean(process.env.MAPKIT_PRIVATE_KEY)
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
    const resolvedOrigin = resolveMapKitJsOrigin(origin);
    const cacheKey = cacheKeyForOrigin(resolvedOrigin);
    const now = Date.now();
    let cachedToken = tokenCache.get(cacheKey);

    if (!cachedToken || cachedToken.expiresAt - now < SAFETY_BUFFER_MS) {
      cachedToken = await signMapKitJwt("mapkit-js", TOKEN_TTL_SECONDS, {
        requestOrigin: origin,
      });
      tokenCache.set(cacheKey, cachedToken);
      logger.info("Signed new MapKit JWT", {
        expiresAt: new Date(cachedToken.expiresAt).toISOString(),
        origin: resolvedOrigin ?? null,
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
});
