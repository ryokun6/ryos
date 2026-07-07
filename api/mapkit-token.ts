import { createAppleJwtTokenHandler } from "./_utils/_apple-jwt-token-handler.js";
import {
  listMapKitMissingEnv,
  parseMapKitPrivateKey,
  signMapKitJwt,
} from "./_utils/_mapkit-jwt.js";

export default createAppleJwtTokenHandler({
  label: "MapKit",
  notConfiguredError: "MapKit not configured",
  privateKeyEnvKey: "MAPKIT_PRIVATE_KEY",
  tokenTtlSeconds: 30 * 60, // 30 minutes
  responseCacheSeconds: 5 * 60, // 5 minutes — clients may reuse the same JWT
  safetyBufferMs: 60_000, // refresh if <60s remaining
  listMissingEnv: listMapKitMissingEnv,
  hasPrivateKeyEnv: () => Boolean(process.env.MAPKIT_PRIVATE_KEY),
  parsePrivateKey: parseMapKitPrivateKey,
  sign: (ttlSeconds) => signMapKitJwt("mapkit-js", ttlSeconds),
});
