import { apiHandler } from "./_utils/api-handler.js";
import { handleAppleDevTokenRequest } from "./_utils/apple-dev-token-handler.js";
import {
  listMapKitMissingEnv,
  parseMapKitPrivateKey,
  signMapKitJwt,
} from "./_utils/_mapkit-jwt.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const TOKEN_TTL_SECONDS = 30 * 60; // 30 minutes
const RESPONSE_CACHE_SECONDS = 5 * 60; // 5 minutes — clients may reuse the same JWT

const mapkitTokenConfig = {
  serviceName: "MapKit",
  notConfiguredError: "MapKit not configured",
  tokenTtlSeconds: TOKEN_TTL_SECONDS,
  responseCacheSeconds: RESPONSE_CACHE_SECONDS,
  safetyBufferMs: 60_000,
  listMissingEnv: listMapKitMissingEnv,
  parsePrivateKey: parseMapKitPrivateKey,
  signToken: (ttlSeconds: number) => signMapKitJwt("mapkit-js", ttlSeconds),
  privateKeyEnvName: "MAPKIT_PRIVATE_KEY",
} as const;

export default apiHandler(
  { methods: ["GET"] },
  async ({ res, logger, startTime }) => {
    await handleAppleDevTokenRequest(res, logger, startTime, mapkitTokenConfig);
  }
);
