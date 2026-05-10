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
let _lastProductTTLDate: string | null = null;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function k(suffix: string, date: string): string {
  return `analytics:${suffix}:${date}`;
}

function pk(suffix: string, date: string): string {
  return `analytics:product:${suffix}:${date}`;
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
// Product/app event analytics — first-party replacement for Vercel Analytics
// ────────────────────────────────────────────────────────────────────────────

const MAX_PRODUCT_EVENTS_PER_BATCH = 25;
const MAX_PRODUCT_PROPERTY_KEYS = 20;
const MAX_PRODUCT_STRING_LENGTH = 160;
const VALID_DIMENSION_RE = /^[a-zA-Z0-9][a-zA-Z0-9:_./@ -]{0,159}$/;
const VALID_EVENT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9:_./-]{0,99}$/;
const SENSITIVE_PROPERTY_RE =
  /(password|token|secret|authorization|cookie|message|prompt|content|html|base64|blob|dataurl|transcript|body|text)$/i;

const SONG_EVENT_NAMES = new Set([
  "ipod:song_play",
  "media:song_play",
]);
const SITE_EVENT_NAMES = new Set([
  "internet-explorer:navigation_success",
]);

const MAX_SONG_LABEL_LENGTH = 120;
const MAX_SITE_LABEL_LENGTH = 120;
const MAX_COUNTRY_LABEL_LENGTH = 80;

function pickProductString(
  properties: Record<string, ProductAnalyticsPrimitive> | undefined,
  ...keys: string[]
): string | undefined {
  if (!properties) return undefined;
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function buildSongLabel(
  properties: Record<string, ProductAnalyticsPrimitive>
): string | undefined {
  const title = pickProductString(properties, "title");
  if (!title) return undefined;
  const artist = pickProductString(properties, "artist");
  const label = artist ? `${artist} — ${title}` : title;
  return label.slice(0, MAX_SONG_LABEL_LENGTH);
}

function buildSiteLabel(
  properties: Record<string, ProductAnalyticsPrimitive>
): string | undefined {
  // The IE navigation event already calls `normalizeUrlForAnalytics` so we
  // get a non-PII `host` field. Fall back to `pathTop` for completeness.
  const host = pickProductString(properties, "host");
  if (!host) return undefined;
  return host.slice(0, MAX_SITE_LABEL_LENGTH);
}

function normalizeCountryLabel(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Keep ISO-3166 codes upper-case; otherwise truncate and strip control chars.
  // eslint-disable-next-line no-control-regex
  const cleaned = trimmed.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_COUNTRY_LABEL_LENGTH);
  return cleaned.length <= 3 ? cleaned.toUpperCase() : cleaned;
}

const KNOWN_APP_IDS = new Set([
  "finder",
  "soundboard",
  "internet-explorer",
  "chats",
  "textedit",
  "paint",
  "photo-booth",
  "minesweeper",
  "videos",
  "tv",
  "ipod",
  "karaoke",
  "synth",
  "terminal",
  "applet-viewer",
  "control-panels",
  "admin",
  "stickies",
  "infinite-mac",
  "pc",
  "winamp",
  "calendar",
  "contacts",
  "dashboard",
  "candybar",
  "maps",
]);

export type ProductAnalyticsPrimitive = string | number | boolean | null;

export interface ProductAnalyticsEvent {
  name: string;
  timestamp?: number;
  sessionId?: string;
  clientId?: string;
  path?: string;
  referrer?: string;
  appId?: string;
  category?: string;
  source?: string;
  properties?: Record<string, ProductAnalyticsPrimitive | undefined>;
}

export interface ProductAnalyticsBatch {
  events: ProductAnalyticsEvent[];
}

export interface ProductAnalyticsRequestContext {
  ip: string;
  username?: string | null;
  userAgent?: string | null;
  /**
   * Optional ISO-3166 country code (or country name) resolved from the
   * request IP. When present, country counts are bumped per event so the
   * admin dashboard can render a "top countries" breakdown without
   * persisting raw IP addresses.
   */
  country?: string | null;
}

interface SanitizedProductAnalyticsEvent {
  name: string;
  sessionId?: string;
  clientId?: string;
  path?: string;
  appId?: string;
  category: string;
  source: string;
  properties: Record<string, ProductAnalyticsPrimitive>;
}

export interface DailyProductEventMetrics {
  date: string;
  events: number;
  pageViews: number;
  sessions: number;
  appLifecycle: number;
  auth: number;
  errors: number;
  uniqueVisitors: number;
}

export interface ProductAnalyticsSummary {
  days: DailyProductEventMetrics[];
  totals: {
    events: number;
    pageViews: number;
    sessions: number;
    appLifecycle: number;
    auth: number;
    errors: number;
    uniqueVisitors: number;
  };
}

export interface ProductEventBreakdown {
  name: string;
  count: number;
}

export interface ProductAnalyticsDetail {
  summary: ProductAnalyticsSummary;
  topEvents: ProductEventBreakdown[];
  topApps: ProductEventBreakdown[];
  categories: ProductEventBreakdown[];
  sources: ProductEventBreakdown[];
  topPaths: ProductEventBreakdown[];
  /** Top songs played across iPod / karaoke (`<artist> — <title>`). */
  topSongs: ProductEventBreakdown[];
  /** Top external sites visited via Internet Explorer (host name). */
  topSites: ProductEventBreakdown[];
  /** Top visitor countries derived from server-side IP geolocation. */
  topCountries: ProductEventBreakdown[];
}

function normalizeDimension(value: unknown, fallback?: string): string | undefined {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const truncated = trimmed.slice(0, MAX_PRODUCT_STRING_LENGTH);
  return VALID_DIMENSION_RE.test(truncated) ? truncated : fallback;
}

function normalizeProductEventName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 100);
  if (!trimmed || !VALID_EVENT_NAME_RE.test(trimmed)) return null;
  return trimmed;
}

function normalizeProductPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, "http://local");
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 4)
      .map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 48));
    return `/${parts.join("/")}`;
  } catch {
    const path = value.split("?")[0].split("#")[0].slice(0, 120);
    if (!path.startsWith("/")) return undefined;
    return path.replace(/[^a-zA-Z0-9/_-]/g, "-") || "/";
  }
}

function normalizeAppId(value: unknown): string | undefined {
  const candidate = normalizeDimension(value);
  if (!candidate) return undefined;
  return KNOWN_APP_IDS.has(candidate) ? candidate : undefined;
}

function sanitizeProductProperties(
  properties: ProductAnalyticsEvent["properties"]
): Record<string, ProductAnalyticsPrimitive> {
  const safe: Record<string, ProductAnalyticsPrimitive> = {};
  if (!properties || typeof properties !== "object") return safe;

  for (const [rawKey, rawValue] of Object.entries(properties)) {
    if (Object.keys(safe).length >= MAX_PRODUCT_PROPERTY_KEYS) break;
    const key = rawKey.trim().replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 64);
    if (!key || SENSITIVE_PROPERTY_RE.test(key)) continue;

    if (rawValue === null || typeof rawValue === "boolean") {
      safe[key] = rawValue;
    } else if (typeof rawValue === "number") {
      safe[key] = Number.isFinite(rawValue) ? rawValue : 0;
    } else if (typeof rawValue === "string") {
      safe[key] = rawValue.slice(0, MAX_PRODUCT_STRING_LENGTH);
    }
  }

  return safe;
}

export function sanitizeProductAnalyticsEvent(
  event: ProductAnalyticsEvent
): SanitizedProductAnalyticsEvent | null {
  const name = normalizeProductEventName(event?.name);
  if (!name) return null;

  const category =
    normalizeDimension(event.category) ||
    (name.startsWith("app:") || name.startsWith("window:")
      ? "appLifecycle"
      : name.startsWith("user:")
        ? "auth"
        : name.includes(":crash") || name.includes(":error")
          ? "errors"
          : name === "page:view"
            ? "pageViews"
            : name === "session:start"
              ? "sessions"
              : "events");

  return {
    name,
    sessionId: normalizeDimension(event.sessionId),
    clientId: normalizeDimension(event.clientId),
    path: normalizeProductPath(event.path),
    appId: normalizeAppId(event.appId),
    category,
    source: normalizeDimension(event.source, "web") || "web",
    properties: sanitizeProductProperties(event.properties),
  };
}

function parseProductDailyHash(raw: Record<string, string> | null): Omit<DailyProductEventMetrics, "date" | "uniqueVisitors"> {
  if (!raw) {
    return {
      events: 0,
      pageViews: 0,
      sessions: 0,
      appLifecycle: 0,
      auth: 0,
      errors: 0,
    };
  }
  return {
    events: parseInt(String(raw.events || "0"), 10),
    pageViews: parseInt(String(raw.pageViews || "0"), 10),
    sessions: parseInt(String(raw.sessions || "0"), 10),
    appLifecycle: parseInt(String(raw.appLifecycle || "0"), 10),
    auth: parseInt(String(raw.auth || "0"), 10),
    errors: parseInt(String(raw.errors || "0"), 10),
  };
}

function breakdownFromMap(map: Map<string, number>, limit: number): ProductEventBreakdown[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function recordProductAnalyticsEvents(
  redis: Redis,
  batch: ProductAnalyticsBatch,
  context: ProductAnalyticsRequestContext
): void {
  const events = Array.isArray(batch?.events)
    ? batch.events.slice(0, MAX_PRODUCT_EVENTS_PER_BATCH)
    : [];
  const sanitized = events
    .map((event) => sanitizeProductAnalyticsEvent(event))
    .filter((event): event is SanitizedProductAnalyticsEvent => !!event);

  if (sanitized.length === 0) return;

  const date = todayUTC();
  const dailyKey = pk("daily", date);
  const pipe = redis.pipeline();
  const country = normalizeCountryLabel(context.country);

  for (const event of sanitized) {
    pipe.hincrby(dailyKey, "events", 1);
    if (event.name === "page:view") pipe.hincrby(dailyKey, "pageViews", 1);
    if (event.name === "session:start") pipe.hincrby(dailyKey, "sessions", 1);
    if (event.category === "appLifecycle") pipe.hincrby(dailyKey, "appLifecycle", 1);
    if (event.category === "auth") pipe.hincrby(dailyKey, "auth", 1);
    if (event.category === "errors") pipe.hincrby(dailyKey, "errors", 1);

    const visitorId =
      context.username ||
      event.clientId ||
      event.sessionId ||
      `ip:${context.ip}`;
    pipe.pfadd(pk("uv", date), visitorId);
    pipe.hincrby(pk("event", date), event.name, 1);
    pipe.hincrby(pk("category", date), event.category, 1);
    pipe.hincrby(pk("source", date), event.source, 1);
    if (event.appId) pipe.hincrby(pk("app", date), event.appId, 1);
    if (event.path) pipe.hincrby(pk("path", date), event.path, 1);

    if (SONG_EVENT_NAMES.has(event.name)) {
      const songLabel = buildSongLabel(event.properties);
      if (songLabel) pipe.hincrby(pk("song", date), songLabel, 1);
    }
    if (SITE_EVENT_NAMES.has(event.name)) {
      const siteLabel = buildSiteLabel(event.properties);
      if (siteLabel) pipe.hincrby(pk("site", date), siteLabel, 1);
    }
    // Count one country bucket per event when geo is resolved server-side
    // for the request. We intentionally do NOT trust client-supplied country
    // values to avoid spoofed geography buckets in the dashboard.
    if (country) pipe.hincrby(pk("country", date), country, 1);
  }

  if (_lastProductTTLDate !== date) {
    _lastProductTTLDate = date;
    pipe.expire(dailyKey, ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("uv", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("event", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("category", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("source", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("app", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("path", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("song", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("site", date), ANALYTICS_TTL_SECONDS);
    pipe.expire(pk("country", date), ANALYTICS_TTL_SECONDS);
  }

  pipe.exec().catch((err) => {
    console.warn("[analytics] product pipeline error (non-fatal):", err);
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
  product: ProductAnalyticsDetail;
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

  const product = await getProductAnalyticsDetail(redis, days);

  return { summary, topEndpoints, statusCodes, aiByUser, aiRateLimits, product };
}

export async function getProductAnalyticsSummary(
  redis: Redis,
  days: number = 7
): Promise<ProductAnalyticsSummary> {
  const dates = dateRange(days);
  const uvKeys = dates.map((d) => pk("uv", d));

  const pipe = redis.pipeline();
  for (const date of dates) {
    pipe.hgetall(pk("daily", date));
    pipe.pfcount(pk("uv", date));
  }
  if (uvKeys.length > 0) pipe.pfcount(...uvKeys);
  const results = await pipe.exec();

  const totals = {
    events: 0,
    pageViews: 0,
    sessions: 0,
    appLifecycle: 0,
    auth: 0,
    errors: 0,
    uniqueVisitors: 0,
  };

  const dailyMetrics: DailyProductEventMetrics[] = dates.map((date, i) => {
    const d = parseProductDailyHash(
      (results[i * 2] as Record<string, string> | null) || null
    );
    const uv = (results[i * 2 + 1] as number) || 0;

    totals.events += d.events;
    totals.pageViews += d.pageViews;
    totals.sessions += d.sessions;
    totals.appLifecycle += d.appLifecycle;
    totals.auth += d.auth;
    totals.errors += d.errors;

    return {
      date,
      ...d,
      uniqueVisitors: uv,
    };
  });

  totals.uniqueVisitors =
    uvKeys.length > 0 ? ((results[dates.length * 2] as number) || 0) : 0;

  return { days: dailyMetrics, totals };
}

export async function getProductAnalyticsDetail(
  redis: Redis,
  days: number = 7
): Promise<ProductAnalyticsDetail> {
  const dates = dateRange(days);
  const uvKeys = dates.map((d) => pk("uv", d));
  const CMDS_PER_DAY = 10;

  const pipe = redis.pipeline();
  for (const date of dates) {
    pipe.hgetall(pk("daily", date));
    pipe.pfcount(pk("uv", date));
    pipe.hgetall(pk("event", date));
    pipe.hgetall(pk("app", date));
    pipe.hgetall(pk("category", date));
    pipe.hgetall(pk("source", date));
    pipe.hgetall(pk("path", date));
    pipe.hgetall(pk("song", date));
    pipe.hgetall(pk("site", date));
    pipe.hgetall(pk("country", date));
  }
  if (uvKeys.length > 0) pipe.pfcount(...uvKeys);
  const results = await pipe.exec();

  const totals = {
    events: 0,
    pageViews: 0,
    sessions: 0,
    appLifecycle: 0,
    auth: 0,
    errors: 0,
    uniqueVisitors: 0,
  };
  const eventMap = new Map<string, number>();
  const appMap = new Map<string, number>();
  const categoryMap = new Map<string, number>();
  const sourceMap = new Map<string, number>();
  const pathMap = new Map<string, number>();
  const songMap = new Map<string, number>();
  const siteMap = new Map<string, number>();
  const countryMap = new Map<string, number>();

  const dailyMetrics: DailyProductEventMetrics[] = dates.map((date, i) => {
    const base = i * CMDS_PER_DAY;
    const d = parseProductDailyHash(
      (results[base] as Record<string, string> | null) || null
    );
    const uv = (results[base + 1] as number) || 0;

    totals.events += d.events;
    totals.pageViews += d.pageViews;
    totals.sessions += d.sessions;
    totals.appLifecycle += d.appLifecycle;
    totals.auth += d.auth;
    totals.errors += d.errors;

    mergeHashCounts(eventMap, (results[base + 2] as Record<string, string> | null) || null);
    mergeHashCounts(appMap, (results[base + 3] as Record<string, string> | null) || null);
    mergeHashCounts(categoryMap, (results[base + 4] as Record<string, string> | null) || null);
    mergeHashCounts(sourceMap, (results[base + 5] as Record<string, string> | null) || null);
    mergeHashCounts(pathMap, (results[base + 6] as Record<string, string> | null) || null);
    mergeHashCounts(songMap, (results[base + 7] as Record<string, string> | null) || null);
    mergeHashCounts(siteMap, (results[base + 8] as Record<string, string> | null) || null);
    mergeHashCounts(countryMap, (results[base + 9] as Record<string, string> | null) || null);

    return {
      date,
      ...d,
      uniqueVisitors: uv,
    };
  });

  totals.uniqueVisitors =
    uvKeys.length > 0
      ? ((results[dates.length * CMDS_PER_DAY] as number) || 0)
      : 0;

  return {
    summary: { days: dailyMetrics, totals },
    topEvents: breakdownFromMap(eventMap, 20),
    topApps: breakdownFromMap(appMap, 20),
    categories: breakdownFromMap(categoryMap, 20),
    sources: breakdownFromMap(sourceMap, 20),
    topPaths: breakdownFromMap(pathMap, 20),
    topSongs: breakdownFromMap(songMap, 20),
    topSites: breakdownFromMap(siteMap, 20),
    topCountries: breakdownFromMap(countryMap, 20),
  };
}
