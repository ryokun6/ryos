import type { Redis } from "./redis.js";
import {
  LEGACY_REDIS_SCAN_PATTERNS,
  redisKeys,
  sha256RedisIdentifier,
  type LegacyRedisScanPattern,
} from "../../src/shared/redisKeys.js";

export interface RedisLegacyPatternStatus {
  pattern: LegacyRedisScanPattern;
  count: number;
  sampleKeys: string[];
  truncated: boolean;
}

export interface RedisMigrationStatus {
  checkedAt: string;
  perPatternLimit: number;
  totalLegacyKeys: number;
  truncated: boolean;
  patterns: RedisLegacyPatternStatus[];
}

export interface RedisKeyMigrationPlan {
  legacyKey: string;
  targetKey: string | null;
  additionalKeys?: string[];
  action: "copy" | "skip";
  reason?: string;
}

export interface RedisBackfillResult {
  pattern: string;
  dryRun: boolean;
  scanned: number;
  planned: number;
  copied: number;
  skipped: number;
  warnings: string[];
  truncated: boolean;
  keys: RedisKeyMigrationPlan[];
}

export interface RedisDeleteLegacyResult {
  pattern: string;
  dryRun: boolean;
  scanned: number;
  deleted: number;
  truncated: boolean;
  keys: string[];
}

const LEGACY_PATTERN_SET = new Set<string>(LEGACY_REDIS_SCAN_PATTERNS);
const STATUS_SCAN_COUNT = 1000;

function isKnownLegacyPattern(pattern: string): pattern is LegacyRedisScanPattern {
  return LEGACY_PATTERN_SET.has(pattern);
}

export function assertKnownLegacyRedisPattern(pattern: string): void {
  if (!isKnownLegacyPattern(pattern)) {
    throw new Error("Pattern must be one of the registered legacy Redis patterns");
  }
}

function suffixAfter(key: string, prefix: string): string {
  return key.slice(prefix.length);
}

function splitSuffix(key: string, prefix: string): string[] {
  const suffix = suffixAfter(key, prefix);
  return suffix ? suffix.split(":") : [];
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function scanKeys(
  redis: Redis,
  pattern: string,
  limit: number
): Promise<{ keys: string[]; truncated: boolean }> {
  const keys: string[] = [];
  const seen = new Set<string>();
  let cursor: string | number = 0;
  let iterations = 0;

  do {
    const [nextCursor, batch] = await redis.scan(cursor, {
      match: pattern,
      count: STATUS_SCAN_COUNT,
    });
    cursor = nextCursor;
    iterations += 1;
    for (const key of batch) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
        if (keys.length >= limit) break;
      }
    }
  } while (
    cursor !== 0 &&
    cursor !== "0" &&
    keys.length < limit &&
    iterations < 250
  );

  return {
    keys: keys.sort(),
    truncated: keys.length >= limit || (cursor !== 0 && cursor !== "0"),
  };
}

export async function getRedisMigrationStatus(
  redis: Redis,
  perPatternLimit: number
): Promise<RedisMigrationStatus> {
  const patterns: RedisLegacyPatternStatus[] = [];
  for (const pattern of LEGACY_REDIS_SCAN_PATTERNS) {
    const { keys, truncated } = await scanKeys(redis, pattern, perPatternLimit);
    patterns.push({
      pattern,
      count: keys.length,
      sampleKeys: keys.slice(0, 10),
      truncated,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    perPatternLimit,
    totalLegacyKeys: patterns.reduce((sum, item) => sum + item.count, 0),
    truncated: patterns.some((item) => item.truncated),
    patterns,
  };
}

export async function planRedisKeyMigration(
  legacyKey: string
): Promise<RedisKeyMigrationPlan> {
  if (legacyKey === "airdrop:presence") {
    return { legacyKey, targetKey: redisKeys.presence.airdropLobby(), action: "copy" };
  }
  if (legacyKey.startsWith("airdrop:transfer:")) {
    return {
      legacyKey,
      targetKey: redisKeys.session.airdropTransfer(suffixAfter(legacyKey, "airdrop:transfer:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("analytics:")) {
    const [metric, ...rest] = splitSuffix(legacyKey, "analytics:");
    if (["aiu", "daily", "ep", "st", "uv"].includes(metric) && rest.length > 0) {
      return {
        legacyKey,
        targetKey: redisKeys.analytics.apiMetric(metric, rest.join(":")),
        action: "copy",
      };
    }
  }
  if (legacyKey.startsWith("apple:artwork:")) {
    return {
      legacyKey,
      targetKey: redisKeys.cache.appleArtwork(suffixAfter(legacyKey, "apple:artwork:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("applet:share:")) {
    return {
      legacyKey,
      targetKey: redisKeys.media.appletShare(suffixAfter(legacyKey, "applet:share:")),
      action: "copy",
    };
  }
  if (legacyKey === "chat:irc:servers") {
    return { legacyKey, targetKey: redisKeys.integration.ircServerIds(), action: "copy" };
  }
  if (legacyKey.startsWith("chat:irc:server:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.ircServer(suffixAfter(legacyKey, "chat:irc:server:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("chat:messages:")) {
    return {
      legacyKey,
      targetKey: redisKeys.chat.roomMessages(suffixAfter(legacyKey, "chat:messages:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("chat:password:")) {
    return {
      legacyKey,
      targetKey: redisKeys.auth.userPassword(suffixAfter(legacyKey, "chat:password:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("chat:presencez:") || legacyKey.startsWith("chat:presence:")) {
    const roomId = legacyKey.startsWith("chat:presencez:")
      ? suffixAfter(legacyKey, "chat:presencez:")
      : suffixAfter(legacyKey, "chat:presence:");
    return { legacyKey, targetKey: redisKeys.chat.roomPresence(roomId), action: "copy" };
  }
  if (legacyKey.startsWith("chat:room:users:")) {
    return {
      legacyKey,
      targetKey: redisKeys.chat.roomPresence(suffixAfter(legacyKey, "chat:room:users:")),
      action: "skip",
      reason: "Delete-only legacy room user index has no current writer",
    };
  }
  if (legacyKey.startsWith("chat:room:")) {
    return {
      legacyKey,
      targetKey: redisKeys.chat.roomMeta(suffixAfter(legacyKey, "chat:room:")),
      action: "copy",
    };
  }
  if (legacyKey === "chat:rooms") {
    return { legacyKey, targetKey: redisKeys.chat.roomIds(), action: "copy" };
  }
  if (legacyKey.startsWith("chat:token:user:")) {
    const [username, ...tokenParts] = splitSuffix(legacyKey, "chat:token:user:");
    const token = tokenParts.join(":");
    if (!username || !token) {
      return { legacyKey, targetKey: null, action: "skip", reason: "Malformed auth token key" };
    }
    const tokenHash = await sha256RedisIdentifier(token);
    return {
      legacyKey,
      targetKey: redisKeys.auth.session(tokenHash),
      additionalKeys: [redisKeys.auth.userSessions(username)],
      action: "copy",
    };
  }
  if (legacyKey.startsWith("chat:token:last:")) {
    return {
      legacyKey,
      targetKey: redisKeys.auth.lastSession(suffixAfter(legacyKey, "chat:token:last:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("chat:users:")) {
    return {
      legacyKey,
      targetKey: redisKeys.auth.userProfile(suffixAfter(legacyKey, "chat:users:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("cursor-sdk-agent:") && legacyKey.endsWith(":latestRun")) {
    const agentId = legacyKey.slice("cursor-sdk-agent:".length, -":latestRun".length);
    return { legacyKey, targetKey: redisKeys.agent.cursorLatestRun(agentId), action: "copy" };
  }
  if (legacyKey.startsWith("cursor-sdk-run:")) {
    const parts = splitSuffix(legacyKey, "cursor-sdk-run:");
    const facet = parts.at(-1);
    const runId = parts.slice(0, -1).join(":");
    if (runId && facet === "events") {
      return { legacyKey, targetKey: redisKeys.agent.cursorRunEvents(runId), action: "copy" };
    }
    if (runId && facet === "meta") {
      return { legacyKey, targetKey: redisKeys.agent.cursorRunMeta(runId), action: "copy" };
    }
  }
  if (legacyKey.startsWith("geoip:v1:")) {
    const ipHash = await sha256RedisIdentifier(suffixAfter(legacyKey, "geoip:v1:"));
    return { legacyKey, targetKey: redisKeys.cache.geoip(ipHash), action: "copy" };
  }
  if (legacyKey.startsWith("ie:cache:")) {
    const parts = splitSuffix(legacyKey, "ie:cache:");
    const year = parts.at(-1);
    const encodedUrl = parts.slice(0, -1).join(":");
    if (year && encodedUrl) {
      const urlHash = await sha256RedisIdentifier(safeDecode(encodedUrl));
      return { legacyKey, targetKey: redisKeys.cache.ieVersions(urlHash, year), action: "copy" };
    }
  }
  if (legacyKey === "listen:sessions") {
    return { legacyKey, targetKey: redisKeys.session.listenIds(), action: "copy" };
  }
  if (legacyKey.startsWith("listen:session:")) {
    return {
      legacyKey,
      targetKey: redisKeys.session.listen(suffixAfter(legacyKey, "listen:session:")),
      action: "copy",
    };
  }
  if (legacyKey.endsWith(":processing_lock") && legacyKey.startsWith("memory:user:")) {
    const username = legacyKey.slice("memory:user:".length, -":processing_lock".length);
    return { legacyKey, targetKey: redisKeys.memory.processingLock(username), action: "copy" };
  }
  if (legacyKey.startsWith("rl:")) {
    return { legacyKey, targetKey: null, action: "skip", reason: "Ephemeral rate-limit key" };
  }
  if (legacyKey.startsWith("rt:ticket:")) {
    const ticketHash = await sha256RedisIdentifier(suffixAfter(legacyKey, "rt:ticket:"));
    return { legacyKey, targetKey: redisKeys.realtime.ticket(ticketHash), action: "copy" };
  }
  if (legacyKey === "song:all") {
    return { legacyKey, targetKey: redisKeys.media.songIds(), action: "copy" };
  }
  if (legacyKey.startsWith("song:meta:")) {
    return {
      legacyKey,
      targetKey: redisKeys.media.songMeta(suffixAfter(legacyKey, "song:meta:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("song:content:")) {
    return {
      legacyKey,
      targetKey: redisKeys.media.songContent(suffixAfter(legacyKey, "song:content:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("sync2:")) {
    const parts = splitSuffix(legacyKey, "sync2:");
    const family = parts[0];
    const username = parts.slice(1).join(":");
    const byFamily: Record<string, ((username: string) => string) | undefined> = {
      blobs: redisKeys.sync.v2Blobs,
      jrnl: redisKeys.sync.v2Journal,
      kv: redisKeys.sync.v2Kv,
      lock: redisKeys.sync.v2Lock,
      seq: redisKeys.sync.v2Seq,
      "ttl-touched": redisKeys.sync.v2TtlTouched,
    };
    const builder = byFamily[family];
    if (builder && username) {
      return { legacyKey, targetKey: builder(username), action: "copy" };
    }
    if (legacyKey === "sync2:maint:cursor") {
      return { legacyKey, targetKey: redisKeys.sync.maintenanceCursor(), action: "copy" };
    }
  }
  if (legacyKey.startsWith("sync:meta:")) {
    return {
      legacyKey,
      targetKey: redisKeys.sync.backupMeta(suffixAfter(legacyKey, "sync:meta:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("sync:pref:autoSync:")) {
    return {
      legacyKey,
      targetKey: redisKeys.sync.autoSyncPreference(suffixAfter(legacyKey, "sync:pref:autoSync:")),
      action: "copy",
    };
  }
  if (
    legacyKey.startsWith("sync:state:") ||
    legacyKey.startsWith("sync:auto:") ||
    legacyKey.startsWith("sync:songs:")
  ) {
    return {
      legacyKey,
      targetKey: null,
      action: "skip",
      reason: "Legacy sync v1 data must be imported into sync v2 before deletion",
    };
  }
  if (legacyKey.startsWith("telegram:link:code:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.telegramLinkCode(suffixAfter(legacyKey, "telegram:link:code:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("telegram:link:username:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.telegramPendingLink(suffixAfter(legacyKey, "telegram:link:username:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("telegram:user:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.telegramAccountByTelegramUser(suffixAfter(legacyKey, "telegram:user:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("telegram:username:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.telegramAccountByUsername(suffixAfter(legacyKey, "telegram:username:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("telegram:history:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.telegramHistory(suffixAfter(legacyKey, "telegram:history:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("telegram:update:")) {
    return {
      legacyKey,
      targetKey: redisKeys.integration.telegramUpdate(suffixAfter(legacyKey, "telegram:update:")),
      action: "copy",
    };
  }
  if (legacyKey.startsWith("telegram:heartbeat:")) {
    const parts = splitSuffix(legacyKey, "telegram:heartbeat:");
    const slot = parts.at(-1);
    const username = parts.slice(0, -1).join(":");
    if (username && slot) {
      return {
        legacyKey,
        targetKey: redisKeys.integration.telegramHeartbeat(username, slot),
        action: "copy",
      };
    }
  }
  if (legacyKey.startsWith("wayback:cache:")) {
    const parts = splitSuffix(legacyKey, "wayback:cache:");
    const year = parts.at(-1);
    const encodedUrl = parts.slice(0, -1).join(":");
    if (year && encodedUrl) {
      const urlHash = await sha256RedisIdentifier(safeDecode(encodedUrl));
      return { legacyKey, targetKey: redisKeys.cache.wayback(urlHash, year), action: "copy" };
    }
  }

  return {
    legacyKey,
    targetKey: null,
    action: "skip",
    reason: "No canonical mapping registered for this legacy key",
  };
}

async function copyRedisValue(
  redis: Redis,
  sourceKey: string,
  targetKey: string
): Promise<string | null> {
  const type = await redis.type(sourceKey);
  const ttl = await redis.ttl(sourceKey);
  switch (type) {
    case "string": {
      const value = await redis.get(sourceKey);
      await redis.set(targetKey, value, ttl > 0 ? { ex: ttl } : undefined);
      return null;
    }
    case "list": {
      const values = await redis.lrange<string>(sourceKey, 0, -1);
      await redis.del(targetKey);
      if (values.length > 0) await redis.rpush(targetKey, ...values);
      if (ttl > 0) await redis.expire(targetKey, ttl);
      return null;
    }
    case "set": {
      const members = await redis.smembers<string[]>(sourceKey);
      await redis.del(targetKey);
      if (members.length > 0) await redis.sadd(targetKey, ...members);
      if (ttl > 0) await redis.expire(targetKey, ttl);
      return null;
    }
    case "hash": {
      const hash = (await redis.hgetall<Record<string, unknown>>(sourceKey)) ?? {};
      await redis.del(targetKey);
      if (Object.keys(hash).length > 0) await redis.hset(targetKey, hash);
      if (ttl > 0) await redis.expire(targetKey, ttl);
      return null;
    }
    case "zset":
      return `Skipped ${sourceKey}: score-preserving zset copy is not supported by RedisLike`;
    case "none":
      return `Skipped ${sourceKey}: key no longer exists`;
    default:
      return `Skipped ${sourceKey}: unsupported Redis type ${type}`;
  }
}

async function applyAdditionalMigrationSideEffects(
  redis: Redis,
  plan: RedisKeyMigrationPlan
): Promise<void> {
  if (
    plan.legacyKey.startsWith("chat:token:user:") &&
    plan.targetKey &&
    plan.additionalKeys?.length
  ) {
    const sessionSetKey = plan.additionalKeys[0];
    const tokenHash = suffixAfter(plan.targetKey, "auth:session:");
    await redis.sadd(sessionSetKey, tokenHash);
    const ttl = await redis.ttl(plan.legacyKey);
    if (ttl > 0) await redis.expire(sessionSetKey, ttl);
  }
}

export async function backfillRedisKeyScheme(
  redis: Redis,
  input: { pattern: string; limit: number; dryRun: boolean }
): Promise<RedisBackfillResult> {
  assertKnownLegacyRedisPattern(input.pattern);
  const { keys, truncated } = await scanKeys(redis, input.pattern, input.limit);
  const plans = await Promise.all(keys.map((key) => planRedisKeyMigration(key)));
  const warnings: string[] = [];
  let copied = 0;
  let skipped = 0;

  for (const plan of plans) {
    if (plan.action === "skip" || !plan.targetKey) {
      skipped += 1;
      if (plan.reason) warnings.push(`${plan.legacyKey}: ${plan.reason}`);
      continue;
    }
    if (input.dryRun) {
      continue;
    }
    const warning = await copyRedisValue(redis, plan.legacyKey, plan.targetKey);
    if (warning) {
      skipped += 1;
      warnings.push(warning);
      continue;
    }
    await applyAdditionalMigrationSideEffects(redis, plan);
    copied += 1;
  }

  return {
    pattern: input.pattern,
    dryRun: input.dryRun,
    scanned: keys.length,
    planned: plans.filter((plan) => plan.action === "copy" && plan.targetKey).length,
    copied,
    skipped,
    warnings,
    truncated,
    keys: plans,
  };
}

export async function deleteLegacyRedisKeys(
  redis: Redis,
  input: { pattern: string; limit: number; dryRun: boolean }
): Promise<RedisDeleteLegacyResult> {
  assertKnownLegacyRedisPattern(input.pattern);
  const { keys, truncated } = await scanKeys(redis, input.pattern, input.limit);
  const deleted = input.dryRun || keys.length === 0 ? 0 : await redis.del(...keys);
  return {
    pattern: input.pattern,
    dryRun: input.dryRun,
    scanned: keys.length,
    deleted,
    truncated,
    keys,
  };
}
