import type { VercelResponse } from "@vercel/node";
import type { initLogger } from "./_logging.js";
import type { MapKitSignedJwt, PrivateKeyParseResult } from "./_mapkit-jwt.js";

type ApiLogger = ReturnType<typeof initLogger>["logger"];

export interface AppleDevTokenHandlerConfig {
  serviceName: string;
  notConfiguredError: string;
  tokenTtlSeconds: number;
  responseCacheSeconds: number;
  safetyBufferMs: number;
  listMissingEnv: () => string[];
  parsePrivateKey: () => PrivateKeyParseResult;
  signToken: (ttlSeconds: number) => Promise<MapKitSignedJwt>;
  /** Env var name checked for key-parse diagnostics when listed as missing. */
  privateKeyEnvName: string;
}

const tokenCache = new WeakMap<AppleDevTokenHandlerConfig, MapKitSignedJwt>();

/**
 * Shared GET handler for Apple developer-token endpoints (MapKit JS, MusicKit JS).
 */
export async function handleAppleDevTokenRequest(
  res: VercelResponse,
  logger: ApiLogger,
  startTime: number,
  config: AppleDevTokenHandlerConfig
): Promise<void> {
  const missing = config.listMissingEnv();
  if (missing.length > 0) {
    const keyDiagnostics =
      missing.includes(config.privateKeyEnvName) &&
      (process.env[config.privateKeyEnvName] ||
        (config.privateKeyEnvName === "MUSICKIT_PRIVATE_KEY" &&
          process.env.MAPKIT_PRIVATE_KEY))
        ? config.parsePrivateKey()
        : undefined;

    logger.warn(`${config.serviceName} token endpoint missing env vars`, {
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
    let cachedToken = tokenCache.get(config) ?? null;
    if (!cachedToken || cachedToken.expiresAt - now < config.safetyBufferMs) {
      cachedToken = await config.signToken(config.tokenTtlSeconds);
      tokenCache.set(config, cachedToken);
      logger.info(`Signed new ${config.serviceName} JWT`, {
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
    logger.error(`Failed to sign ${config.serviceName} token`, error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({
      error: `Failed to sign ${config.serviceName} token`,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
