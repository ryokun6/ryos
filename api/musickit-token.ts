import { createAppleJwtTokenHandler } from "./_utils/_apple-jwt-token-handler.js";
import {
  listMusicKitMissingEnv,
  parseMusicKitPrivateKey,
  signMusicKitJwt,
} from "./_utils/_musickit-jwt.js";

// MusicKit dev tokens may live up to 6 months. We use 7 days here to limit
// blast radius if a token leaks; the in-memory cache prevents excess signing.
export default createAppleJwtTokenHandler({
  label: "MusicKit",
  notConfiguredError: "MusicKit not configured",
  privateKeyEnvKey: "MUSICKIT_PRIVATE_KEY",
  tokenTtlSeconds: 7 * 24 * 60 * 60,
  responseCacheSeconds: 30 * 60, // browsers may reuse JWT for 30m
  safetyBufferMs: 60 * 60 * 1000, // refresh if <1h remaining
  listMissingEnv: listMusicKitMissingEnv,
  hasPrivateKeyEnv: () =>
    Boolean(process.env.MUSICKIT_PRIVATE_KEY || process.env.MAPKIT_PRIVATE_KEY),
  parsePrivateKey: parseMusicKitPrivateKey,
  sign: signMusicKitJwt,
});
