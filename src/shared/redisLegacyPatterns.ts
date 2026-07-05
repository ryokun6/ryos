/**
 * Legacy Redis key scan patterns for the standalone migration CLI
 * (`scripts/redis-key-migration.ts`). Runtime API handlers use only canonical
 * keys from `redisKeys.ts`; these patterns exist for ops backfill/delete.
 */

export const LEGACY_REDIS_SCAN_PATTERNS = [
  "airdrop:*",
  "analytics:aiu:*",
  "analytics:daily:*",
  "analytics:ep:*",
  "analytics:st:*",
  "analytics:uv:*",
  "apple:*",
  "applet:*",
  "chat:irc:*",
  "chat:messages:*",
  "chat:password:*",
  "chat:presence:*",
  "chat:presencez:*",
  "chat:room:*",
  "chat:rooms",
  "chat:token:*",
  "chat:users:*",
  "cursor-sdk-agent:*",
  "cursor-sdk-run:*",
  "geoip:*",
  "ie:*",
  "listen:*",
  "memory:user:*:processing_lock",
  "rl:*",
  "rt:*",
  "ryos:presence:*",
  "song:*",
  "sync:pref:*",
  "sync2:*",
  "telegram:*",
  "wayback:*",
] as const;

export type LegacyRedisScanPattern = (typeof LEGACY_REDIS_SCAN_PATTERNS)[number];
