import type { Redis } from "./redis.js";

/**
 * IP-based geolocation fallback for non-Vercel deployments (Coolify, Docker,
 * plain Bun, etc.) where `geolocation()` from `@vercel/functions` returns an
 * empty object.
 *
 * Resolution order:
 *   1. Skip any private/loopback/link-local IP (returns null).
 *   2. Read a cached lookup from Redis (24h TTL).
 *   3. Call the configured HTTP geolocation provider (defaults to
 *      `https://ipwho.is/{ip}` — free, HTTPS, no API key required).
 *   4. Cache the result (success or "unknown") so we don't hammer the provider
 *      from chatty deployments. Negative results get a shorter TTL so they
 *      heal once the provider stops failing.
 *
 * Operators can swap providers by setting:
 *   - `IP_GEOLOCATION_URL_TEMPLATE`: A URL template containing `{ip}` (e.g.
 *     `https://api.ip2location.io/?key=…&ip={ip}`). The response is parsed
 *     with the same loose `latitude/longitude/city/region/country` field
 *     names as ipwho.is / ip-api / ipapi.co.
 *   - `IP_GEOLOCATION_DISABLED`: set to `1` / `true` to disable the fallback
 *     entirely (e.g. for self-hosted setups that don't want outbound calls).
 */

export interface IpGeolocation {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

interface CachedGeoEntry {
  geo: IpGeolocation | null;
  cachedAt: number;
}

const REDIS_KEY_PREFIX = "geoip:v1:";
const CACHE_TTL_SECONDS_HIT = 24 * 60 * 60; // 24h for successful lookups
const CACHE_TTL_SECONDS_MISS = 60 * 60; // 1h for unresolved / errored lookups
const FETCH_TIMEOUT_MS = 4_000; // Keep short so chat latency isn't impacted

const DEFAULT_PROVIDER_TEMPLATE = "https://ipwho.is/{ip}";

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  const lower = ip.toLowerCase();
  if (lower === "unknown-ip" || lower === "localhost-dev") return true;
  if (lower === "::1" || lower === "::" || lower === "0.0.0.0") return true;
  if (lower.startsWith("127.")) return true;
  // RFC1918 + carrier-grade NAT + link-local
  if (lower.startsWith("10.")) return true;
  if (lower.startsWith("192.168.")) return true;
  if (lower.startsWith("169.254.")) return true;
  if (lower.startsWith("100.")) {
    const second = parseInt(lower.split(".")[1] || "0", 10);
    if (second >= 64 && second <= 127) return true;
  }
  if (lower.startsWith("172.")) {
    const second = parseInt(lower.split(".")[1] || "0", 10);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 unique-local + link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  return false;
}

function isGeolocationDisabled(): boolean {
  const flag = process.env.IP_GEOLOCATION_DISABLED?.toLowerCase().trim();
  return flag === "1" || flag === "true" || flag === "yes";
}

function getProviderUrl(ip: string): string {
  const template =
    process.env.IP_GEOLOCATION_URL_TEMPLATE?.trim() || DEFAULT_PROVIDER_TEMPLATE;
  return template.replace(/\{ip\}/g, encodeURIComponent(ip));
}

/**
 * Loosely parse a provider's JSON response into our shared `IpGeolocation`
 * shape. Different free providers use slightly different field names, so we
 * accept a small set of common spellings.
 */
function parseProviderResponse(raw: unknown): IpGeolocation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // ipwho.is / many providers return `success: false` on errors.
  if (r.success === false) return null;

  const lat =
    pickNumberLike(r.latitude) ??
    pickNumberLike(r.lat) ??
    pickNumberLike((r.location as Record<string, unknown> | undefined)?.latitude);
  const lng =
    pickNumberLike(r.longitude) ??
    pickNumberLike(r.lon) ??
    pickNumberLike((r.location as Record<string, unknown> | undefined)?.longitude);

  const city = pickString(r.city);
  const region =
    pickString(r.region) ||
    pickString(r.region_name) ||
    pickString(r.regionName);
  const country =
    pickString(r.country_code) ||
    pickString(r.countryCode) ||
    pickString(r.country);

  if (!lat && !lng && !city && !country) {
    return null;
  }

  const geo: IpGeolocation = {};
  if (lat) geo.latitude = lat;
  if (lng) geo.longitude = lng;
  if (city) geo.city = city;
  if (region) geo.region = region;
  if (country) geo.country = country;
  return geo;
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function pickNumberLike(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return undefined;
    return trimmed;
  }
  return undefined;
}

async function readCache(
  redis: Redis | undefined,
  ip: string
): Promise<CachedGeoEntry | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get<string | CachedGeoEntry>(
      `${REDIS_KEY_PREFIX}${ip}`
    );
    if (!raw) return null;
    if (typeof raw === "string") return JSON.parse(raw) as CachedGeoEntry;
    return raw as CachedGeoEntry;
  } catch {
    return null;
  }
}

async function writeCache(
  redis: Redis | undefined,
  ip: string,
  entry: CachedGeoEntry,
  ttlSeconds: number
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`${REDIS_KEY_PREFIX}${ip}`, JSON.stringify(entry), {
      ex: ttlSeconds,
    });
  } catch {
    // Caching is best-effort.
  }
}

export interface ResolveIpGeolocationOptions {
  ip: string;
  redis?: Redis;
  log?: (...args: unknown[]) => void;
  logError?: (...args: unknown[]) => void;
  /**
   * Existing geolocation (e.g. from Vercel's `geolocation()` helper). When
   * present and complete enough to be useful, returned as-is and we skip the
   * outbound provider call entirely.
   */
  existing?: IpGeolocation | null;
}

function geoIsUseful(geo: IpGeolocation | null | undefined): boolean {
  if (!geo) return false;
  return Boolean(
    (geo.latitude && geo.longitude) || geo.city || geo.country
  );
}

/**
 * Resolve an IP-based approximate geolocation, falling back to a free public
 * provider when the platform-supplied geo (`existing`) is empty.
 *
 * Always returns the most useful geo we have: existing → cached → freshly
 * fetched → null.
 */
export async function resolveIpGeolocation(
  options: ResolveIpGeolocationOptions
): Promise<IpGeolocation | null> {
  const { ip, redis, existing, log, logError } = options;

  if (geoIsUseful(existing)) {
    return existing ?? null;
  }

  if (!ip || isPrivateOrLocalIp(ip)) {
    return existing ?? null;
  }

  if (isGeolocationDisabled()) {
    return existing ?? null;
  }

  const cached = await readCache(redis, ip);
  if (cached) {
    return cached.geo ?? existing ?? null;
  }

  try {
    const url = getProviderUrl(ip);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      log?.(
        `[geoip] provider returned ${response.status} for ${ip}; caching negative`
      );
      await writeCache(
        redis,
        ip,
        { geo: null, cachedAt: Date.now() },
        CACHE_TTL_SECONDS_MISS
      );
      return existing ?? null;
    }
    const json = await response.json();
    const geo = parseProviderResponse(json);
    if (!geo) {
      log?.(`[geoip] provider response unparseable for ${ip}; caching negative`);
      await writeCache(
        redis,
        ip,
        { geo: null, cachedAt: Date.now() },
        CACHE_TTL_SECONDS_MISS
      );
      return existing ?? null;
    }
    log?.(
      `[geoip] resolved ${ip} -> ${geo.city ?? "?"}, ${geo.country ?? "?"} (${geo.latitude ?? "?"},${geo.longitude ?? "?"})`
    );
    await writeCache(
      redis,
      ip,
      { geo, cachedAt: Date.now() },
      CACHE_TTL_SECONDS_HIT
    );
    return geo;
  } catch (error) {
    logError?.(`[geoip] lookup failed for ${ip}`, error);
    await writeCache(
      redis,
      ip,
      { geo: null, cachedAt: Date.now() },
      CACHE_TTL_SECONDS_MISS
    );
    return existing ?? null;
  }
}

// Exported for unit tests.
export const __INTERNAL = {
  isPrivateOrLocalIp,
  parseProviderResponse,
  getProviderUrl,
};
