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
 */

import type { Redis } from "@upstash/redis";

const ANALYTICS_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

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

  // Daily counters
  const dailyKey = k("daily", date);
  pipe.hincrby(dailyKey, "calls", 1);
  pipe.hincrby(dailyKey, "latsum", Math.round(event.latencyMs));
  pipe.hincrby(dailyKey, "latcnt", 1);
  if (isAI) pipe.hincrby(dailyKey, "ai", 1);
  if (isError) pipe.hincrby(dailyKey, "errors", 1);

  // Unique visitors (HyperLogLog)
  const uvKey = k("uv", date);
  pipe.pfadd(uvKey, event.ip);

  // Endpoint breakdown
  pipe.hincrby(k("ep", date), endpoint, 1);

  // Status code breakdown
  pipe.hincrby(k("st", date), String(event.status), 1);

  // AI user breakdown
  if (isAI) {
    const aiUser = event.username || "anonymous";
    pipe.hincrby(k("aiu", date), aiUser, 1);
  }

  // Set TTL on all keys (idempotent — no-op if already set)
  pipe.expire(dailyKey, ANALYTICS_TTL_SECONDS);
  pipe.expire(uvKey, ANALYTICS_TTL_SECONDS);
  pipe.expire(k("ep", date), ANALYTICS_TTL_SECONDS);
  pipe.expire(k("st", date), ANALYTICS_TTL_SECONDS);
  if (isAI) pipe.expire(k("aiu", date), ANALYTICS_TTL_SECONDS);

  // Fire and forget — never block the response
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

export async function getAnalyticsSummary(
  redis: Redis,
  days: number = 7
): Promise<AnalyticsSummary> {
  const dates = dateRange(days);

  const pipe = redis.pipeline();
  for (const date of dates) {
    pipe.hgetall(k("daily", date));
    pipe.pfcount(k("uv", date));
  }

  const results = await pipe.exec();

  let totalCalls = 0;
  let totalAI = 0;
  let totalErrors = 0;
  let totalUV = 0;
  let totalLatSum = 0;
  let totalLatCnt = 0;

  const dailyMetrics: DailyMetrics[] = dates.map((date, i) => {
    const raw = (results[i * 2] as Record<string, string> | null) || {};
    const uv = (results[i * 2 + 1] as number) || 0;

    const calls = parseInt(String(raw.calls || "0"), 10);
    const ai = parseInt(String(raw.ai || "0"), 10);
    const errors = parseInt(String(raw.errors || "0"), 10);
    const latsum = parseInt(String(raw.latsum || "0"), 10);
    const latcnt = parseInt(String(raw.latcnt || "0"), 10);
    const avgLatencyMs = latcnt > 0 ? Math.round(latsum / latcnt) : 0;

    totalCalls += calls;
    totalAI += ai;
    totalErrors += errors;
    totalUV += uv;
    totalLatSum += latsum;
    totalLatCnt += latcnt;

    return { date, calls, ai, errors, uniqueVisitors: uv, avgLatencyMs };
  });

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

export async function getAnalyticsDetail(
  redis: Redis,
  days: number = 7
): Promise<AnalyticsDetail> {
  const summary = await getAnalyticsSummary(redis, days);

  const pipe = redis.pipeline();
  // Aggregate endpoints across all days in range
  const dates = dateRange(days);
  for (const date of dates) {
    pipe.hgetall(k("ep", date));
    pipe.hgetall(k("st", date));
    pipe.hgetall(k("aiu", date));
  }

  const results = await pipe.exec();

  // Merge endpoint breakdowns
  const epMap = new Map<string, number>();
  const stMap = new Map<string, number>();
  const aiuMap = new Map<string, number>();

  for (let i = 0; i < dates.length; i++) {
    const epRaw = (results[i * 3] as Record<string, string> | null) || {};
    const stRaw = (results[i * 3 + 1] as Record<string, string> | null) || {};
    const aiuRaw = (results[i * 3 + 2] as Record<string, string> | null) || {};

    for (const [ep, cnt] of Object.entries(epRaw)) {
      epMap.set(ep, (epMap.get(ep) || 0) + parseInt(String(cnt), 10));
    }
    for (const [st, cnt] of Object.entries(stRaw)) {
      stMap.set(st, (stMap.get(st) || 0) + parseInt(String(cnt), 10));
    }
    for (const [u, cnt] of Object.entries(aiuRaw)) {
      aiuMap.set(u, (aiuMap.get(u) || 0) + parseInt(String(cnt), 10));
    }
  }

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

  // Fetch current AI rate limit state for top AI users
  const aiRateLimits: AIRateLimitInfo[] = [];
  if (aiByUser.length > 0) {
    const rlPipe = redis.pipeline();
    for (const { username } of aiByUser) {
      const rlKey = username === "anonymous" ? null : `rl:ai:${username}`;
      if (rlKey) rlPipe.get(rlKey);
    }
    const rlResults = await rlPipe.exec();
    let rlIdx = 0;
    for (const { username } of aiByUser) {
      if (username === "anonymous") {
        aiRateLimits.push({
          identifier: username,
          currentCount: 0,
          limit: 3,
          windowLabel: "24h",
        });
      } else {
        const count = parseInt(String(rlResults[rlIdx] || "0"), 10);
        rlIdx++;
        aiRateLimits.push({
          identifier: username,
          currentCount: count,
          limit: username === "ryo" ? -1 : 15,
          windowLabel: "5h",
        });
      }
    }
  }

  return {
    summary,
    topEndpoints,
    statusCodes,
    aiByUser,
    aiRateLimits,
  };
}
