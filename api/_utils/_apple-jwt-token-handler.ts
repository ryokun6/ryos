import { apiHandler } from "./api-handler.js";
import type { MapKitSignedJwt } from "./_mapkit-jwt.js";

/**
 * Subset of the `.p8` parse diagnostics surfaced in the 500 response body when
 * the private key env var is set but cannot be parsed.
 */
interface AppleJwtKeyDiagnostics {
  reason?: string;
  rawLength?: number;
  bodyLength?: number;
  hasBeginMarker?: boolean;
  hasEndMarker?: boolean;
  invalidCharSample?: string;
}

export interface AppleJwtTokenHandlerConfig {
  /** Human label used in logs and error messages, e.g. "MapKit". */
  label: string;
  /** Error string returned in the 500 body, e.g. "MapKit not configured". */
  notConfiguredError: string;
  /** Name of the private-key env var as it appears in listMissingEnv(). */
  privateKeyEnvKey: string;
  tokenTtlSeconds: number;
  responseCacheSeconds: number;
  /** Re-sign when the cached token has less than this many ms remaining. */
  safetyBufferMs: number;
  listMissingEnv: () => string[];
  /** Whether the private-key env var is actually present (drives diagnostics). */
  hasPrivateKeyEnv: () => boolean;
  parsePrivateKey: () => AppleJwtKeyDiagnostics;
  sign: (ttlSeconds: number) => Promise<MapKitSignedJwt>;
}

/**
 * Build a GET handler that signs and caches an Apple-issued ES256 JWT
 * (MapKit JS / MusicKit JS). MapKit and MusicKit share the exact same flow —
 * env validation + diagnostics, an in-memory cache with a safety buffer, a
 * `Cache-Control` header, and a `{ token, expiresAt }` body — and differ only
 * in the env vars, TTLs, and signer. Each endpoint gets its own cache via the
 * closure returned here.
 */
export function createAppleJwtTokenHandler(config: AppleJwtTokenHandlerConfig) {
  // In-memory cache shared across requests on the same server instance. The
  // token is re-signed well before expiry so the client never receives a
  // token that's about to expire.
  let cachedToken: MapKitSignedJwt | null = null;

  return apiHandler(
    { methods: ["GET"] },
    async ({ res, logger, startTime }) => {
      const missing = config.listMissingEnv();
      if (missing.length > 0) {
        // When the only "missing" thing is the private key but the env var is
        // actually set, surface why parsing failed so the operator can fix the
        // env value without redeploying with extra logs.
        const keyDiagnostics =
          missing.includes(config.privateKeyEnvKey) && config.hasPrivateKeyEnv()
            ? config.parsePrivateKey()
            : undefined;
        logger.warn(`${config.label} token endpoint missing env vars`, {
          missing,
          keyDiagnostics,
        });
        logger.response(500, Date.now() - startTime);
        res.status(500).json({
          error: config.notConfiguredError,
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
        const now = Date.now();
        if (
          !cachedToken ||
          cachedToken.expiresAt - now < config.safetyBufferMs
        ) {
          cachedToken = await config.sign(config.tokenTtlSeconds);
          logger.info(`Signed new ${config.label} JWT`, {
            expiresAt: new Date(cachedToken.expiresAt).toISOString(),
          });
        }

        res.setHeader(
          "Cache-Control",
          `private, max-age=${config.responseCacheSeconds}`
        );
        logger.response(200, Date.now() - startTime);
        res.status(200).json({
          token: cachedToken.token,
          expiresAt: cachedToken.expiresAt,
        });
      } catch (error) {
        logger.error(`Failed to sign ${config.label} token`, error);
        logger.response(500, Date.now() - startTime);
        res.status(500).json({
          error: `Failed to sign ${config.label} token`,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );
}
