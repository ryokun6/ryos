/**
 * Canonical Redis key registry for the next key-scheme migration.
 *
 * This file intentionally does not change runtime storage behavior by itself.
 * Stage-one migration work can import these builders for new code, tests, admin
 * discovery, and backfill jobs before individual feature modules cut over.
 */

export const REDIS_KEY_SEPARATOR = ":";

export const CANONICAL_REDIS_PREFIXES = [
  "agent",
  "analytics",
  "auth",
  "cache",
  "chat",
  "integration",
  "media",
  "memory",
  "presence",
  "rate",
  "realtime",
  "session",
  "sync",
  "system",
] as const;

export type CanonicalRedisPrefix = (typeof CANONICAL_REDIS_PREFIXES)[number];

/**
 * Legacy key patterns that must be empty before the final no-compatibility
 * cutover. Patterns stay precise where a top-level prefix remains canonical
 * (for example, `chat:*` becomes only selected legacy subtrees).
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
  "sync:auto:*",
  "sync:meta:*",
  "sync:pref:*",
  "sync:songs:*",
  "sync:state:*",
  "sync2:*",
  "telegram:*",
  "wayback:*",
] as const;

export type LegacyRedisScanPattern = (typeof LEGACY_REDIS_SCAN_PATTERNS)[number];

export function normalizeRedisSegment(segment: string | number): string {
  return encodeURIComponent(String(segment).trim().toLowerCase());
}

export function normalizeCaseSensitiveRedisSegment(segment: string | number): string {
  return encodeURIComponent(String(segment).trim());
}

export function redisKey(
  ...segments: Array<string | number | null | undefined>
): string {
  return segments
    .filter(
      (segment): segment is string | number =>
        segment !== null && segment !== undefined && String(segment).trim() !== ""
    )
    .map(normalizeRedisSegment)
    .join(REDIS_KEY_SEPARATOR);
}

export function redisKeyCaseSensitive(
  ...segments: Array<string | number | null | undefined>
): string {
  return segments
    .filter(
      (segment): segment is string | number =>
        segment !== null && segment !== undefined && String(segment).trim() !== ""
    )
    .map(normalizeCaseSensitiveRedisSegment)
    .join(REDIS_KEY_SEPARATOR);
}

function songKey(songId: string, facet: "meta" | "content"): string {
  if (songId.startsWith("am:")) {
    return redisKeyCaseSensitive("media", "song", "am", songId.slice(3), facet);
  }
  return redisKeyCaseSensitive("media", "song", songId, facet);
}

export async function sha256RedisIdentifier(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function redisKeysForHashedIdentifiers() {
  return {
    token: sha256RedisIdentifier,
    ip: sha256RedisIdentifier,
    url: sha256RedisIdentifier,
  };
}

export const redisKeys = {
  auth: {
    userProfile: (username: string) =>
      redisKey("auth", "user", username, "profile"),
    userPassword: (username: string) =>
      redisKey("auth", "user", username, "password"),
    userSessions: (username: string) =>
      redisKey("auth", "user", username, "sessions"),
    session: (tokenHash: string) => redisKey("auth", "session", tokenHash),
    lastSession: (username: string) =>
      redisKey("auth", "user", username, "last-session"),
  },
  chat: {
    roomIds: () => redisKey("chat", "rooms", "ids"),
    roomMeta: (roomId: string) =>
      redisKeyCaseSensitive("chat", "rooms", roomId, "meta"),
    roomMessages: (roomId: string) =>
      redisKeyCaseSensitive("chat", "rooms", roomId, "messages"),
    roomPresence: (roomId: string) =>
      redisKeyCaseSensitive("chat", "rooms", roomId, "presence"),
  },
  sync: {
    v2Seq: (username: string) => redisKey("sync", "v2", "user", username, "seq"),
    v2Kv: (username: string) => redisKey("sync", "v2", "user", username, "kv"),
    v2Journal: (username: string) =>
      redisKey("sync", "v2", "user", username, "journal"),
    v2Blobs: (username: string) =>
      redisKey("sync", "v2", "user", username, "blobs"),
    v2Lock: (username: string) => redisKey("sync", "v2", "user", username, "lock"),
    v2TtlTouched: (username: string) =>
      redisKey("sync", "v2", "user", username, "ttl-touched"),
    maintenanceCursor: () => redisKey("sync", "maintenance", "cursor"),
    backupMeta: (username: string) =>
      redisKey("sync", "backup", "user", username, "meta"),
    autoSyncPreference: (username: string) =>
      redisKey("sync", "preference", "user", username, "auto-sync"),
  },
  rate: {
    counter: (feature: string, window: string, scope: string, identifierHash: string) =>
      redisKey("rate", feature, window, scope, identifierHash),
    block: (feature: string, scope: string, identifierHash: string) =>
      redisKey("rate", "block", feature, scope, identifierHash),
  },
  media: {
    appletShare: (shareId: string) =>
      redisKeyCaseSensitive("media", "applet", "share", shareId),
    songIds: () => redisKey("media", "song", "ids"),
    songMeta: (songId: string) => songKey(songId, "meta"),
    songContent: (songId: string) => songKey(songId, "content"),
  },
  cache: {
    appleArtwork: (catalogId: string) =>
      redisKey("cache", "apple-music", "artwork", catalogId),
    geoip: (ipHash: string) => redisKey("cache", "geoip", ipHash),
    ieVersions: (urlHash: string, year: string | number) =>
      redisKey("cache", "ie", urlHash, year, "versions"),
    wayback: (urlHash: string, year: string | number) =>
      redisKey("cache", "wayback", urlHash, year),
  },
  analytics: {
    apiMetric: (metric: string, date: string) =>
      redisKey("analytics", "api", metric, date),
    productMetric: (metric: string, date: string) =>
      redisKey("analytics", "product", metric, date),
  },
  memory: {
    index: (username: string) => redisKey("memory", "user", username, "index"),
    detail: (username: string, key: string) =>
      redisKey("memory", "user", username, "detail", key),
    daily: (username: string, date: string) =>
      redisKey("memory", "user", username, "daily", date),
    processingLock: (username: string) =>
      redisKey("memory", "user", username, "processing-lock"),
  },
  integration: {
    ircServer: (serverId: string) =>
      redisKeyCaseSensitive("integration", "irc", "server", serverId),
    ircServerIds: () => redisKey("integration", "irc", "servers"),
    telegramLinkCode: (code: string) =>
      redisKeyCaseSensitive("integration", "telegram", "link", "code", code),
    telegramPendingLink: (username: string) =>
      redisKey("integration", "telegram", "link", "user", username),
    telegramAccountByTelegramUser: (telegramUserId: string) =>
      redisKey("integration", "telegram", "account", "telegram-user", telegramUserId),
    telegramAccountByUsername: (username: string) =>
      redisKey("integration", "telegram", "account", "user", username),
    telegramHistory: (chatId: string) =>
      redisKey("integration", "telegram", "history", chatId),
    telegramUpdate: (updateId: string | number) =>
      redisKey("integration", "telegram", "update", updateId),
    telegramHeartbeat: (username: string, slot: string) =>
      redisKey("integration", "telegram", "heartbeat", username, slot),
  },
  realtime: {
    ticket: (ticketHash: string) => redisKey("realtime", "ticket", ticketHash),
    pubsubChannel: () => redisKey("realtime", "pubsub"),
  },
  presence: {
    globalOnline: () => redisKey("presence", "global", "online"),
    airdropLobby: () => redisKey("presence", "airdrop", "lobby"),
  },
  session: {
    listenIds: () => redisKey("session", "listen", "ids"),
    listen: (sessionId: string) =>
      redisKeyCaseSensitive("session", "listen", sessionId),
    airdropTransfer: (transferId: string) =>
      redisKeyCaseSensitive("session", "airdrop", "transfer", transferId),
  },
  agent: {
    cursorRunEvents: (runId: string) =>
      redisKeyCaseSensitive("agent", "cursor", "run", runId, "events"),
    cursorRunMeta: (runId: string) =>
      redisKeyCaseSensitive("agent", "cursor", "run", runId, "meta"),
    cursorLatestRun: (agentId: string) =>
      redisKeyCaseSensitive("agent", "cursor", "agent", agentId, "latest-run"),
  },
  system: {
    userHeartbeats: (username: string, date: string) =>
      redisKey("system", "user", username, "heartbeats", date),
    migrationRun: (runId: string) =>
      redisKeyCaseSensitive("system", "migration", "redis-key-scheme", runId),
  },
} as const;
