import { apiHandler } from "./_utils/api-handler.js";
import { handleAppleDevTokenRequest } from "./_utils/apple-dev-token-handler.js";
import {
  listMusicKitMissingEnv,
  parseMusicKitPrivateKey,
  signMusicKitJwt,
} from "./_utils/_musickit-jwt.js";

export const runtime = "nodejs";
export const maxDuration = 10;

// MusicKit dev tokens may live up to 6 months. We use 7 days here to limit
// blast radius if a token leaks; the in-memory cache prevents excess signing.
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESPONSE_CACHE_SECONDS = 30 * 60; // browsers may reuse JWT for 30m

const musickitTokenConfig = {
  serviceName: "MusicKit",
  notConfiguredError: "MusicKit not configured",
  tokenTtlSeconds: TOKEN_TTL_SECONDS,
  responseCacheSeconds: RESPONSE_CACHE_SECONDS,
  safetyBufferMs: 60 * 60 * 1000,
  listMissingEnv: listMusicKitMissingEnv,
  parsePrivateKey: parseMusicKitPrivateKey,
  signToken: signMusicKitJwt,
  privateKeyEnvName: "MUSICKIT_PRIVATE_KEY",
} as const;

export default apiHandler(
  { methods: ["GET"] },
  async ({ res, logger, startTime }) => {
    await handleAppleDevTokenRequest(res, logger, startTime, musickitTokenConfig);
  }
);
