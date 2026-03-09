/**
 * Lightweight analytics tracking for API usage.
 *
 * Stores per-day counters in Redis using hashes and HyperLogLogs.
 * All writes are fire-and-forget to avoid impacting request latency.
 *
 * Redis key schema:
 *   analytics:daily:{YYYY-MM-DD}    hash  { calls, ai, errors, latsum, latcnt }
 *   analytics:uv:{YYYY-MM-DD}       HyperLogLog  (unique visitor IPs)
 *   analytics:ep:{YYYY-MM-DD}       hash  { endpoint: count }
 *   analytics:st:{YYYY-MM-DD}       hash  { statusCode: count }
 *   analytics:aiu:{YYYY-MM-DD}      hash  { username|"anon": count }
 *
 * Performance:
 *   Write path: 5–8 Redis commands per request in 1 pipeline (fire-and-forget).
 *   EXPIRE is only sent once per calendar day per process to avoid waste.
 *   Read path: admin-only, 1–2 pipelines depending on detail mode.
 */

import type { Redis } from "./redis.js";

const ANALYTICS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

let _lastTTLDate: string | null = null;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function k(suffix: string, date: string): string {
  return `analytics:${suffix}:${date}`;
}

const AI_PATH_PREFIXES = [
  "/api/chat",
  "/api/applet-ai",
  "/api/ie-generate",
  "/api/ai/",
  "/api/speech",
  "/api/audio-transcribe",
];

function isAIEndpoint(path: string): boolean {
  return AI_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function normaliseEndpoint(rawPath: string): string {
  let p = rawPath.split("?")[0];
  p = p.replace(/\/[a-f0-9-]{20,}(?:\/|$)/g, "/:id/");
  p = p.replace(/\/$/, "");
  return p || "/";
}

// ────────────────────────────────────────────────────────────────────────────
// Write path — called after every API response
// ────────────────────────────────────────────────────────────────────────────

export interface AnalyticsEvent {
  path: string;
  method: string;
  status: number;
  latencyMs: number;
  ip: string;
  username?: string | null;
}

export function recordAnalyticsEvent(
  redis: Redis,
  event: AnalyticsEvent
): void {
  const date = todayUTC();
  const endpoint = normaliseEndpoint(event.path);
  const isAI = isAIEndpoint(event.path);
  const isError = event.status >= 400;

  const pipe = redis.pipeline();

  const dailyKey = k("daily", date);
  pipe.hincrby(dailyKey, "calls", 1);
  pipe.hincrby(dailyKey, "latsum", Math.round(event.latencyMs));
  pipe.hincrby(dailyKey, "latcnt", 1);
  if (isAI) pipe.hincrby(dailyKey, "ai", 1);
  if (isError) pipe.hincrby(dailyKey, "errors", 1);

  const visitorId = event.username || `ip:${event.ip}`;
  pipe.pfadd(k("uv", date), visitorId);
  pipe.hincrby(k("ep", date), endpoint, 1);
  pipe.hincrby(k("st", date), String(event.status), 1);

  if (isAI) {
    pipe.hincrby(k("aiu", date), event.username || "anonymous", 1);
  }

  // Set TTL once per calendar day per process — avoids 4-5 redundant
  // EXPIRE commands on every single request.
  if (_lastTTLDate !== date) {
    _lastTTLDate = date;
    pipe.expire(dailyKey, ANALYTICS_TTL_SECONDS);
    pipe.expire(k("uv", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(k("ep", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(k("st", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(k("aiu", date), ANALYTICS_TTL_SECONDS);
  }

  pipe.exec().catch((err) => {
    console.warn("[analytics] pipeline error (non-fatal):", err);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Read path — admin-only queries
// ────────────────────────────────────────────────────────────────────────────

export interface DailyMetrics {
  date: string;
  calls: number;
  ai: number;
  errors: number;
  uniqueVisitors: number;
  avgLatencyMs: number;
}

export interface AnalyticsSummary {
  days: DailyMetrics[];
  totals: {
    calls: number;
    ai: number;
    errors: number;
    uniqueVisitors: number;
    avgLatencyMs: number;
  };
}

export interface EndpointBreakdown {
  endpoint: string;
  count: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface AIUserBreakdown {
  username: string;
  count: number;
}

export interface AnalyticsDetail {
  summary: AnalyticsSummary;
  topEndpoints: EndpointBreakdown[];
  statusCodes: StatusBreakdown[];
  aiByUser: AIUserBreakdown[];
  aiRateLimits: AIRateLimitInfo[];
}

export interface AIRateLimitInfo {
  identifier: string;
  currentCount: number;
  limit: number;
  windowLabel: string;
}

function dateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Parse a daily-hash result from the pipeline into numeric fields.
 */
function parseDailyHash(raw: Record<string, string> | null): {
  calls: number;
  ai: number;
  errors: number;
  latsum: number;
  latcnt: number;
} {
  if (!raw) return { calls: 0, ai: 0, errors: 0, latsum: 0, latcnt: 0 };
  return {
    calls: parseInt(String(raw.calls || "0"), 10),
    ai: parseInt(String(raw.ai || "0"), 10),
    errors: parseInt(String(raw.errors || "0"), 10),
    latsum: parseInt(String(raw.latsum || "0"), 10),
    latcnt: parseInt(String(raw.latcnt || "0"), 10),
  };
}

function mergeHashCounts(
  map: Map<string, number>,
  raw: Record<string, string> | null
): void {
  if (!raw) return;
  for (const [key, cnt] of Object.entries(raw)) {
    map.set(key, (map.get(key) || 0) + parseInt(String(cnt), 10));
  }
}

/**
 * Summary-only view.
 * 1 pipeline: 2 commands per day + 1 PFCOUNT across all UV keys for
 * true cross-day unique visitor count (HLL union).
 */
export async function getAnalyticsSummary(
  redis: Redis,
  days: number = 7
): Promise<AnalyticsSummary> {
  const dates = dateRange(days);
  const uvKeys = dates.map((d) => k("uv", d));

  const pipe = redis.pipeline();
  for (const date of dates) {
    pipe.hgetall(k("daily", date));
    pipe.pfcount(k("uv", date));
  }
  // Cross-day unique visitors via HLL union (single PFCOUNT with N keys)
  if (uvKeys.length > 0) pipe.pfcount(...uvKeys);
  const results = await pipe.exec();

  let totalCalls = 0;
  let totalAI = 0;
  let totalErrors = 0;
  let totalLatSum = 0;
  let totalLatCnt = 0;

  const dailyMetrics: DailyMetrics[] = dates.map((date, i) => {
    const d = parseDailyHash(
      (results[i * 2] as Record<string, string> | null) || null
    );
    const uv = (results[i * 2 + 1] as number) || 0;
    const avgLatencyMs = d.latcnt > 0 ? Math.round(d.latsum / d.latcnt) : 0;

    totalCalls += d.calls;
    totalAI += d.ai;
    totalErrors += d.errors;
    totalLatSum += d.latsum;
    totalLatCnt += d.latcnt;

    return {
      date,
      calls: d.calls,
      ai: d.ai,
      errors: d.errors,
      uniqueVisitors: uv,
      avgLatencyMs,
    };
  });

  // Last result in the pipeline is the cross-day PFCOUNT union
  const totalUV =
    uvKeys.length > 0
      ? ((results[dates.length * 2] as number) || 0)
      : 0;

  return {
    days: dailyMetrics,
    totals: {
      calls: totalCalls,
      ai: totalAI,
      errors: totalErrors,
      uniqueVisitors: totalUV,
      avgLatencyMs:
        totalLatCnt > 0 ? Math.round(totalLatSum / totalLatCnt) : 0,
    },
  };
}

/**
 * Detailed view: 1 pipeline for everything (summary + breakdowns),
 * plus 1 optional small pipeline for AI rate-limit lookups.
 *
 * Per-day slot layout in the single pipeline:
 *   [hgetall(daily), pfcount(uv), hgetall(ep), hgetall(st), hgetall(aiu)]
 *   = 5 commands per day, + 1 cross-day PFCOUNT at the end.
 */
export async function getAnalyticsDetail(
  redis: Redis,
  days: number = 7
): Promise<AnalyticsDetail> {
  const dates = dateRange(days);
  const uvKeys = dates.map((d) => k("uv", d));
  const CMDS_PER_DAY = 5;

  const pipe = redis.pipeline();
  for (const date of dates) {
    pipe.hgetall(k("daily", date));
    pipe.pfcount(k("uv", date));
    pipe.hgetall(k("ep", date));
    pipe.hgetall(k("st", date));
    pipe.hgetall(k("aiu", date));
  }
  if (uvKeys.length > 0) pipe.pfcount(...uvKeys);
  const results = await pipe.exec();

  let totalCalls = 0;
  let totalAI = 0;
  let totalErrors = 0;
  let totalLatSum = 0;
  let totalLatCnt = 0;

  const epMap = new Map<string, number>();
  const stMap = new Map<string, number>();
  const aiuMap = new Map<string, number>();

  const dailyMetrics: DailyMetrics[] = dates.map((date, i) => {
    const base = i * CMDS_PER_DAY;
    const d = parseDailyHash(
      (results[base] as Record<string, string> | null) || null
    );
    const uv = (results[base + 1] as number) || 0;
    const avgLatencyMs = d.latcnt > 0 ? Math.round(d.latsum / d.latcnt) : 0;

    totalCalls += d.calls;
    totalAI += d.ai;
    totalErrors += d.errors;
    totalLatSum += d.latsum;
    totalLatCnt += d.latcnt;

    mergeHashCounts(epMap, (results[base + 2] as Record<string, string> | null) || null);
    mergeHashCounts(stMap, (results[base + 3] as Record<string, string> | null) || null);
    mergeHashCounts(aiuMap, (results[base + 4] as Record<string, string> | null) || null);

    return {
      date,
      calls: d.calls,
      ai: d.ai,
      errors: d.errors,
      uniqueVisitors: uv,
      avgLatencyMs,
    };
  });

  const totalUV =
    uvKeys.length > 0
      ? ((results[dates.length * CMDS_PER_DAY] as number) || 0)
      : 0;

  const summary: AnalyticsSummary = {
    days: dailyMetrics,
    totals: {
      calls: totalCalls,
      ai: totalAI,
      errors: totalErrors,
      uniqueVisitors: totalUV,
      avgLatencyMs:
        totalLatCnt > 0 ? Math.round(totalLatSum / totalLatCnt) : 0,
    },
  };

  const topEndpoints = [...epMap.entries()]
    .map(([endpoint, count]) => ({ endpoint, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const statusCodes = [...stMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const aiByUser = [...aiuMap.entries()]
    .map(([username, count]) => ({ username, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // ── AI rate-limit lookups (small optional pipeline) ──
  const aiRateLimits: AIRateLimitInfo[] = [];
  const nonAnonUsers = aiByUser.filter((u) => u.username !== "anonymous");
  if (nonAnonUsers.length > 0) {
    const rlPipe = redis.pipeline();
    for (const { username } of nonAnonUsers) {
      rlPipe.get(`rl:ai:${username}`);
    }
    const rlResults = await rlPipe.exec();
    for (let i = 0; i < nonAnonUsers.length; i++) {
      const username = nonAnonUsers[i].username;
      aiRateLimits.push({
        identifier: username,
        currentCount: parseInt(String(rlResults[i] || "0"), 10),
        limit: username === "ryo" ? -1 : 15,
        windowLabel: "5h",
      });
    }
  }
  if (aiuMap.has("anonymous")) {
    aiRateLimits.push({
      identifier: "anonymous",
      currentCount: 0,
      limit: 3,
      windowLabel: "24h",
    });
  }

  return { summary, topEndpoints, statusCodes, aiByUser, aiRateLimits };
}
