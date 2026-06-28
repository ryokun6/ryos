import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
import { normalizeUrlForCacheKey } from "./_utils/_url.js";
import { safeFetchWithRedirects, validatePublicUrl, SsrfBlockedError } from "./_utils/_ssrf.js";
import { getAppPublicOrigin } from "./_utils/runtime-config.js";
import { decodeHtmlEntitiesOnce } from "./_utils/html-entities.js";
import { redisKeys, sha256RedisIdentifier } from "../src/shared/redisKeys.js";
import {
  buildBrowserHeaders,
  createProxyUrl,
  getCookieHeaderForUrl,
  getSetCookieHeaders,
  mergeProxyCookies,
  normalizeProxyResourceType,
  rewriteCssForProxy,
  rewriteHtmlForProxy,
  type ProxyResourceType,
  type RewriteStats,
  type StoredProxyCookie,
} from "./_utils/iframe-proxy-helpers.js";
import {
  getIeDomainCompatibility,
  shouldAutoProxyUrl,
  shouldUseInertProxyScripts,
} from "../src/shared/ieCompatibility.js";

export const runtime = "nodejs";

// --- Utility Functions ----------------------------------------------------

async function getIeCacheKey(normalizedUrlForKey: string, year: string): Promise<string> {
  return redisKeys.cache.ieVersions(
    await sha256RedisIdentifier(normalizedUrlForKey),
    year
  );
}

async function getWaybackCacheKey(
  normalizedUrlForKey: string,
  yearMonth: string
): Promise<string> {
  return redisKeys.cache.wayback(
    await sha256RedisIdentifier(normalizedUrlForKey),
    yearMonth
  );
}

type ProxyDiagnostics = {
  mode: string;
  resourceType: ProxyResourceType;
  targetHost?: string;
  upstreamStatus?: number;
  finalUrl?: string;
  contentType?: string;
  redirectCount?: number;
  rewrites?: RewriteStats;
  cookieSession?: boolean;
  compatibilityMode?: string;
  errorType?: string;
};

const emptyRewriteStats = (): RewriteStats => ({
  htmlAttributes: 0,
  srcset: 0,
  cssUrls: 0,
  forms: 0,
});

const getProxyAssetOrigin = (requestOrigin: string | null): string =>
  requestOrigin || getAppPublicOrigin(requestOrigin);

// Live modern sites can overwhelm the sandboxed iframe; keep their HTML static
// while preserving ryOS's own injected navigation helper.
const disableExecutableScripts = (
  html: string
): string =>
  html.replace(
    /<script\b([^>]*)>/gi,
    (_match, attrs: string) => {
      const strippedAttrs = attrs.replace(
        /\s+type\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
        ""
      );
      return `<script type="text/plain" data-ryos-blocked-script="true"${strippedAttrs}>`;
    }
  );

const promoteNoscriptImageFallbacks = (html: string): string =>
  html.replace(
    /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi,
    (match, content: string) =>
      /<(?:picture|img)\b/i.test(content) ? content : match
  );

const getQueryValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const getSafeReferrerUrl = (rawRef: string | string[] | undefined): string | null => {
  const ref = getQueryValue(rawRef);
  if (!ref) return null;
  try {
    const parsed = new URL(ref);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
};

const getProxySessionId = (rawSession: string | string[] | undefined): string | null => {
  const session = getQueryValue(rawSession);
  if (!session) return null;
  return /^[a-zA-Z0-9_-]{8,96}$/.test(session) ? session : null;
};

const shouldUseLocalProxyFixture = (
  rawFixture: string | string[] | undefined
): string | null => {
  if (process.env.NODE_ENV === "production") return null;
  const fixture = getQueryValue(rawFixture);
  return fixture && /^[a-z0-9_-]{1,64}$/i.test(fixture) ? fixture : null;
};

const setDiagnosticsHeader = (
  res: { setHeader: (name: string, value: string) => void },
  enabled: boolean,
  diagnostics: ProxyDiagnostics
) => {
  if (!enabled) return;
  res.setHeader(
    "X-Proxy-Diagnostics",
    encodeURIComponent(JSON.stringify(diagnostics))
  );
};

function createLocalProxyFixtureResponse(
  fixture: string,
  targetUrl: string,
  headers: Record<string, string>
): { response: Response; finalUrl: string; redirectChain: string[] } | null {
  const fixtureOrigin = new URL(targetUrl).origin;
  if (fixture === "html-assets") {
    return {
      finalUrl: targetUrl,
      redirectChain: [],
      response: new Response(
        `<!doctype html><html><head><title>Proxy Fixture</title><link rel="stylesheet" href="/assets/site.css"><script src="/assets/app.js" integrity="sha256-test" nonce="abc"></script><style>.hero{background:url('/assets/hero.png')}@import "/assets/extra.css";</style></head><body><img src="/assets/logo.png" srcset="/assets/logo-1x.png 1x, /assets/logo-2x.png 2x"><video poster="/assets/poster.jpg"><source src="/assets/movie.mp4"></video><iframe src="/nested"></iframe><form method="post" action="/submit"><input name="q" value="ryos"></form></body></html>`,
        {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-fixture-accept": headers.Accept || "",
          },
        }
      ),
    };
  }

  if (fixture === "noscript-images") {
    return {
      finalUrl: targetUrl,
      redirectChain: [],
      response: new Response(
        `<!doctype html><html><head><title>Noscript Fixture</title><script src="/assets/app.js"></script></head><body><picture><img alt="lazy placeholder" loading="lazy"></picture><noscript><picture><source srcset="/assets/fallback.webp 1x"><img src="/assets/fallback.jpg" alt="fallback"></picture></noscript><noscript><p>No image fallback</p></noscript></body></html>`,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }
      ),
    };
  }

  if (fixture === "stylesheet") {
    return {
      finalUrl: targetUrl,
      redirectChain: [],
      response: new Response(
        `.logo{background:url("./logo.png")}@import url("/nested.css");`,
        {
          status: 200,
          headers: { "content-type": "text/css; charset=utf-8" },
        }
      ),
    };
  }

  if (fixture === "headers") {
    return {
      finalUrl: targetUrl,
      redirectChain: [],
      response: new Response(JSON.stringify({
        accept: headers.Accept,
        secFetchDest: headers["Sec-Fetch-Dest"],
        userAgent: headers["User-Agent"],
        cookie: headers.Cookie || "",
        referer: headers.Referer || "",
        origin: fixtureOrigin,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  if (fixture === "set-cookie") {
    return {
      finalUrl: targetUrl,
      redirectChain: [],
      response: new Response("<!doctype html><title>Cookie Fixture</title>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "set-cookie": "proxy_fixture=stored; Path=/; Max-Age=600; SameSite=Lax",
        },
      }),
    };
  }

  if (fixture === "post-echo") {
    return {
      finalUrl: targetUrl,
      redirectChain: [],
      response: new Response(JSON.stringify({
        method: "POST",
        contentType: headers["Content-Type"] || "",
        cookie: headers.Cookie || "",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    };
  }

  return null;
}

async function readProxyRequestBody(req: {
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  [Symbol.asyncIterator]?: () => AsyncIterator<Buffer | Uint8Array | string>;
}): Promise<BodyInit | undefined> {
  const contentType = getQueryValue(req.headers["content-type"]) || "";
  const bodyValue = req.body;

  if (
    bodyValue &&
    typeof bodyValue === "object" &&
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(bodyValue as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, String(item));
      } else if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    return params.toString();
  }

  if (typeof bodyValue === "string") return bodyValue;
  if (bodyValue instanceof Uint8Array) return bodyValue;

  if (typeof req[Symbol.asyncIterator] === "function") {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of req as AsyncIterable<Buffer | Uint8Array | string>) {
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk);
      total += buffer.length;
      if (total > 1024 * 1024) {
        throw new Error("POST body is too large for proxying");
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  return undefined;
}

async function loadProxyCookies(
  redis: { get: (key: string) => Promise<unknown> },
  sessionId: string | null
): Promise<{ key: string; cookies: StoredProxyCookie[] } | null> {
  if (!sessionId) return null;
  const sessionHash = await sha256RedisIdentifier(sessionId);
  const key = redisKeys.cache.ieProxyCookies(sessionHash);
  const raw = await redis.get(key);
  if (!raw) return { key, cookies: [] };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      key,
      cookies: Array.isArray(parsed) ? (parsed as StoredProxyCookie[]) : [],
    };
  } catch {
    return { key, cookies: [] };
  }
}

/**
 * Edge function that checks if a remote website allows itself to be embedded in an iframe.
 * We look at two common headers:
 *   1. `X-Frame-Options` – if present with values like `deny` or `sameorigin` we treat it as blocked.
 *   2. `Content-Security-Policy` – if it contains a `frame-ancestors` directive that does **not**
 *      include `*` or our own origin, we treat it as blocked.
 *
 * The function returns a small JSON object:
 *   {
 *     allowed: boolean,
 *     reason?: string
 *     title?: string
 *   }
 *
 * On network or other unexpected errors we default to `allowed: true` so that navigation is not
 * blocked accidentally (the front‑end still has its own error handling for actual iframe errors).
 */

export default apiHandler(
  {
    methods: ["GET", "POST"],
    contentType: null,
  },
  async ({ req, res, redis, logger, startTime, origin }) => {
  const urlParam = req.query.url as string | undefined;
  let mode = (req.query.mode as string | undefined) || "proxy"; // "check" | "proxy" | "ai" | "list-cache"
  const year = req.query.year as string | undefined;
  const month = req.query.month as string | undefined;
  const effectiveOrigin = origin;
  const method = (req.method || "GET").toUpperCase();
  const resourceType = normalizeProxyResourceType(req.query.resource);
  const referrerUrl = getSafeReferrerUrl(req.query.ref);
  const proxySessionId = getProxySessionId(req.query.session);
  const debugProxy = getQueryValue(req.query.debug as string | string[] | undefined) === "1";
  const fixtureName = shouldUseLocalProxyFixture(req.query.fixture);
  const diagnostics: ProxyDiagnostics = {
    mode,
    resourceType,
    cookieSession: !!proxySessionId,
  };

  // Helper for consistent error responses with CORS
  const errorResponseWithCors = (
    message: string,
    status: number = 400,
    errorType = "request_error"
  ) => {
    diagnostics.errorType = errorType;
    setDiagnosticsHeader(res, debugProxy, diagnostics);
    if (effectiveOrigin) {
      res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
    }
    res.setHeader("Content-Type", "application/json");
    logger.response(status, Date.now() - startTime);
    return res.status(status).json({ error: message });
  };

  if (!urlParam) {
    logger.error("Missing 'url' query parameter");
    return errorResponseWithCors("Missing 'url' query parameter");
  }

  if (method !== "GET" && mode !== "proxy") {
    return errorResponseWithCors("POST proxying is only supported in proxy mode", 405);
  }
  if (
    method === "POST" &&
    getQueryValue(req.query.form as string | string[] | undefined) !== "1"
  ) {
    return errorResponseWithCors("POST proxying requires a proxied form action", 400);
  }
  if (method === "POST") {
    const contentType = getQueryValue(req.headers["content-type"]) || "";
    const allowedPostContentType =
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data") ||
      contentType.includes("text/plain");
    if (!allowedPostContentType) {
      return errorResponseWithCors("Unsupported proxied form content type", 415);
    }
  }

  // Ensure the URL starts with a protocol for fetch()
  const normalizedUrl = urlParam.startsWith("http")
    ? urlParam
    : `https://${urlParam}`;
  try {
    diagnostics.targetHost = new URL(normalizedUrl).hostname;
  } catch {
    // validatePublicUrl will produce the user-facing error below.
  }

  // Log normalized URL
  logger.info(`Normalized URL: ${normalizedUrl}`);

  try {
    await validatePublicUrl(normalizedUrl);
  } catch (error) {
    const message =
      error instanceof SsrfBlockedError ? error.message : "Invalid URL format";
    logger.warn("Blocked URL for iframe check", { normalizedUrl, message, mode });
    return errorResponseWithCors(message, 400, "ssrf_blocked");
  }

  // ---------------------------
  // Rate limiting (mode-specific)
  // ---------------------------
  try {
    const ip = getClientIp(req);
    const BURST_WINDOW = 60; // 1 minute
    const burstKeyBase = ["rl", "iframe", mode, "ip", ip];

    if (mode === "proxy" || mode === "check") {
      // Global per-IP burst
      const globalKey = RateLimit.makeKey(burstKeyBase);
      const global = await RateLimit.checkCounterLimit({
        key: globalKey,
        windowSeconds: BURST_WINDOW,
        limit: 300, // Relaxed global limit for proxy/check
      });
      if (!global.allowed) {
        logger.warn("Rate limit exceeded (global)", { ip, mode });
        res.setHeader("Retry-After", String(global.resetSeconds ?? BURST_WINDOW));
        res.setHeader("Content-Type", "application/json");
        if (effectiveOrigin) {
          res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
        }
        logger.response(429, Date.now() - startTime);
        return res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "global",
          mode,
        });
      }

      // Per-host anti-scrape if URL present
      try {
        const hostname = new URL(
          urlParam.startsWith("http") ? urlParam : `https://${urlParam}`
        ).hostname.toLowerCase();
        const hostKey = RateLimit.makeKey([
          "rl",
          "iframe",
          mode,
          "ip",
          ip,
          "host",
          hostname,
        ]);
        const host = await RateLimit.checkCounterLimit({
          key: hostKey,
          windowSeconds: BURST_WINDOW,
          limit: 100, // Relaxed per-host limit for proxy/check
        });
        if (!host.allowed) {
          logger.warn("Rate limit exceeded (host)", { ip, hostname, mode });
          res.setHeader("Retry-After", String(host.resetSeconds ?? BURST_WINDOW));
          res.setHeader("Content-Type", "application/json");
          if (effectiveOrigin) {
            res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
          }
          logger.response(429, Date.now() - startTime);
          return res.status(429).json({
            error: "rate_limit_exceeded",
            scope: "host",
            host: hostname,
            mode,
          });
        }
      } catch (e) {
        // Ignore invalid URL parse or missing hostname
        void e;
      }
    } else if (mode === "ai" || mode === "list-cache") {
      const key = RateLimit.makeKey(burstKeyBase);
      const rateRes = await RateLimit.checkCounterLimit({
        key,
        windowSeconds: BURST_WINDOW,
        limit: 120, // Relaxed limits for cached lookups/listing
      });
      if (!rateRes.allowed) {
        logger.warn("Rate limit exceeded", { ip, mode });
        res.setHeader("Retry-After", String(rateRes.resetSeconds ?? BURST_WINDOW));
        res.setHeader("Content-Type", "application/json");
        if (effectiveOrigin) {
          res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
        }
        logger.response(429, Date.now() - startTime);
        return res.status(429).json({ error: "rate_limit_exceeded", scope: mode });
      }
    }
  } catch (e) {
    logger.error("Rate limit check failed (iframe-check)", e);
  }

  // --- AI cache retrieval mode (PRIORITIZE THIS) ---
  if (mode === "ai") {
    const aiUrl = normalizedUrl;
    if (!year) {
      logger.error("Missing year for AI cache mode", { year });
      return errorResponseWithCors("Missing year parameter");
    }

    // Validate year format
    const isValidYear =
      /^\d{1,4}( BC)?$/.test(year) || // Handles "500", "800", "1000 BC" etc.
      /^\d+ CE$/.test(year) || // Handles "1 CE"
      year === "current"; // Special case

    if (!isValidYear) {
      logger.error("Invalid year format for AI cache mode", { year });
      return errorResponseWithCors("Invalid year format");
    }

    // Normalize the URL for the cache key
    const normalizedUrlForKey = normalizeUrlForCacheKey(aiUrl);
    logger.info(`Normalized URL for AI cache key: ${normalizedUrlForKey}`);

    if (!normalizedUrlForKey) {
      // Handle case where normalization failed
      logger.error("URL normalization failed for AI cache key");
      return errorResponseWithCors("URL normalization failed", 500);
    }

    try {
      const key = await getIeCacheKey(normalizedUrlForKey, year);
      logger.info(`Checking AI cache with key: ${key}`);
      const html = (await redis.lindex(key, 0)) as string | null;
      if (html) {
        logger.info(`AI Cache HIT for key: ${key}`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("X-AI-Cache", "HIT");
        logger.response(200, Date.now() - startTime);
        return res.status(200).send(html);
      }
      logger.info(`AI Cache MISS for key: ${key}`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      logger.response(404, Date.now() - startTime);
      return res.status(404).json({ aiCache: false });
    } catch (e) {
      logger.error("Error checking AI cache", e);
      res.setHeader("Content-Type", "application/json");
      logger.response(500, Date.now() - startTime);
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  // --- List Cache mode (Combined AI and Wayback) ---
  if (mode === "list-cache") {
    const listUrl = normalizedUrl;
    logger.info(`Executing in 'list-cache' mode for: ${listUrl}`);

    const normalizedUrlForKey = normalizeUrlForCacheKey(listUrl);
    logger.info(`Normalized URL for list-cache key: ${normalizedUrlForKey}`);
    if (!normalizedUrlForKey) {
      logger.error("URL normalization failed for list-cache key");
      return errorResponseWithCors("URL normalization failed", 500);
    }

    try {
      const uniqueYears = new Set<string>();
      const urlHash = await sha256RedisIdentifier(normalizedUrlForKey);

      // Scan for AI Cache keys (cache:ie:{hash}:{year}:versions)
      const canonicalAiPattern = `cache:ie:${urlHash}:*:versions`;
      logger.info(`Scanning Redis for AI cache with pattern: ${canonicalAiPattern}`);
      let canonicalAiCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(canonicalAiCursor, {
          match: canonicalAiPattern,
          count: 100,
        });
        canonicalAiCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const parts = key.split(":");
          const yearPart = parts[3] ? decodeURIComponent(parts[3]) : "";
          if (yearPart && /^(\d{1,4}( BC)?|\d+ CE)$/i.test(yearPart)) {
            uniqueYears.add(yearPart.replace(/\b(bc|ce)\b/gi, (era) => era.toUpperCase()));
          }
        }
      } while (canonicalAiCursor !== 0);

      // Scan for Wayback Cache keys (cache:wayback:{hash}:{yearMonth})
      const canonicalWaybackPattern = `cache:wayback:${urlHash}:*`;
      logger.info(`Scanning Redis for Wayback cache with pattern: ${canonicalWaybackPattern}`);
      let canonicalWaybackCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(canonicalWaybackCursor, {
          match: canonicalWaybackPattern,
          count: 100,
        });
        canonicalWaybackCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearMonthPart = key.split(":")[3];
          if (yearMonthPart && /^\d{6}$/.test(yearMonthPart)) {
            uniqueYears.add(yearMonthPart.substring(0, 4));
          }
        }
      } while (canonicalWaybackCursor !== 0);

      // Convert Set to Array
      const sortedYears = Array.from(uniqueYears);

      // Sort the unique years chronologically (newest first)
      sortedYears.sort((a, b) => {
        // Handle 'current' separately if it exists (should always be first/newest)
        if (a === "current") return -1;
        if (b === "current") return 1;

        const valA = parseInt(a.replace(" BC", ""), 10);
        const valB = parseInt(b.replace(" BC", ""), 10);
        const isABC = a.includes(" BC");
        const isBBC = b.includes(" BC");

        if (isABC && !isBBC) return 1; // BC is older
        if (!isABC && isBBC) return -1; // AD is newer
        if (isABC && isBBC) return valA - valB; // Sort BC ascending (older first)
        return valB - valA; // Sort AD descending (newer first)
      });

      logger.info(`Found ${sortedYears.length} unique cached years for URL: ${listUrl}`);

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({ years: sortedYears });
    } catch (e) {
      logger.error("Error listing combined cache keys", e);
      res.setHeader("Content-Type", "application/json");
      logger.response(500, Date.now() - startTime);
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  // --- Regular Check/Proxy Logic ---

  // Check if this is an auto-proxy domain
  const compatibilityRule = getIeDomainCompatibility(normalizedUrl);
  const isAutoProxyDomain = shouldAutoProxyUrl(normalizedUrl);
  diagnostics.compatibilityMode = compatibilityRule?.mode;
  if (isAutoProxyDomain) {
    logger.info(`Domain ${new URL(normalizedUrl).hostname} is auto-proxied`);
  }

  // For auto-proxy domains in check mode (and NOT an AI cache request), return JSON indicating embedding is not allowed
  if (isAutoProxyDomain && mode === "check") {
    logger.info("Auto-proxy domain in 'check' mode, returning allowed: false");
    res.setHeader("Content-Type", "application/json");
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({
      allowed: false,
      reason: "Auto-proxied domain",
    });
  }

  // Read theme to drive conditional font override injection
  const theme = ((req.query.theme as string) || "").toLowerCase();
  const shouldInjectFontOverrides = theme !== "macosx";

  // Determine target URL (Wayback or original)
  let targetUrl = normalizedUrl;
  let isWaybackRequest = false;
  let waybackYear: string | null = null;
  let waybackMonth: string | null = null;

  // If year and month are provided (likely from a YYYYMM entry click), construct Wayback URL
  if (year && month && mode === "proxy") {
    // Only construct Wayback URL if proxying with year/month
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month)) {
      targetUrl = `https://web.archive.org/web/${year}${month}01/${normalizedUrl}`;
      logger.info(`Using Wayback Machine URL: ${targetUrl}`);
      isWaybackRequest = true;
      waybackYear = year;
      waybackMonth = month;
      // No need to force proxy mode here, it's already required
    } else {
      logger.error("Invalid year/month format for Wayback request", { year, month });
      // Potentially return an error or fall back to non-Wayback? Let's return error.
      return errorResponseWithCors("Invalid year/month format for Wayback proxy");
    }
  }

  // Check Wayback cache *only* if this is a Wayback request being proxied
  if (isWaybackRequest && waybackYear && waybackMonth) {
    try {
      logger.info(`Initializing Wayback cache check for ${normalizedUrl} (${waybackYear}/${waybackMonth})`);
      const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
      if (normalizedUrlForKey) {
        const cacheKey = await getWaybackCacheKey(
          normalizedUrlForKey,
          `${waybackYear}${waybackMonth}`
        );
        logger.info(`Generated Wayback cache key: ${cacheKey}`);
        const cachedContent = (await redis.get(cacheKey)) as string | null;
        if (cachedContent) {
          logger.info(`Wayback Cache HIT for ${cacheKey} (content length: ${cachedContent.length})`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("X-Wayback-Cache", "HIT");
          logger.response(200, Date.now() - startTime);
          return res.status(200).send(cachedContent);
        }
        logger.info(`Wayback Cache MISS for ${cacheKey}, proceeding with Wayback Machine request`);
      } else {
        logger.info(`URL normalization failed for Wayback cache: ${normalizedUrl}`);
      }
    } catch (e) {
      logger.error(`Wayback cache check failed for ${normalizedUrl} (${waybackYear}/${waybackMonth})`, e);
      // Continue with normal flow if cache check fails
    }
  }

  // Force proxy mode for auto-proxy domains only if NOT a Wayback request already
  if (isAutoProxyDomain && !isWaybackRequest && mode !== "proxy") {
    logger.info("Forcing proxy mode for auto-proxied domain");
    mode = "proxy";
  }

  // -------------------------------
  // Helper: perform header‑only check
  // -------------------------------
  const checkSiteEmbeddingAllowed = async () => {
    try {
      logger.info(`Performing header check for: ${targetUrl}`);
      const { response: fetchRes, finalUrl } = await safeFetchWithRedirects(
        targetUrl,
        {
          method: "GET",
          headers: buildBrowserHeaders({
            targetUrl,
            resourceType: "document",
            referrerUrl,
            method: "GET",
          }),
        },
        { maxRedirects: 10 }
      );

      if (!fetchRes.ok) {
        throw new Error(`Upstream fetch failed with status ${fetchRes.status}`);
      }

      const xFrameOptions = fetchRes.headers.get("x-frame-options") || "";
      const headerCsp = fetchRes.headers.get("content-security-policy") || "";
      const contentType = fetchRes.headers.get("content-type") || "";

      // Check meta tags and extract title only for HTML content
      let metaCsp = "";
      let pageTitle: string | undefined = undefined; // Initialize title

      if (contentType.includes("text/html")) {
        const html = await fetchRes.text();
        // Extract meta CSP
        const metaTagMatch = html.match(
          /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([^"']*)["'][^>]*>/i
        );
        if (metaTagMatch && metaTagMatch[1]) {
          metaCsp = metaTagMatch[1];
        }
        // Extract title (case-insensitive)
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          pageTitle = decodeHtmlEntitiesOnce(titleMatch[1]).trim();
        }
      }

      // Helper to check frame-ancestors directive
      const checkFrameAncestors = (cspString: string): boolean => {
        if (!cspString) return false; // No policy = no restriction
        const directiveMatch = cspString
          .toLowerCase()
          .split(";")
          .map((d) => d.trim())
          .find((d) => d.startsWith("frame-ancestors"));
        if (!directiveMatch) return false; // No frame-ancestors = no restriction from this policy

        const directiveValue = directiveMatch
          .replace("frame-ancestors", "")
          .trim();
        // If the value is exactly 'none', it's definitely blocked.
        if (directiveValue === "'none'") return true; // Blocked

        // Simplified: if it doesn't contain '*', assume it blocks cross-origin.
        return !directiveValue.includes("*");
      };

      const isBlockedByCsp = (() => {
        // Blocked if *either* header OR meta tag CSP restricts frame-ancestors
        return checkFrameAncestors(headerCsp) || checkFrameAncestors(metaCsp);
      })();

      const isBlockedByXfo = (() => {
        if (!xFrameOptions) return false;
        const value = xFrameOptions.toLowerCase();
        return value.includes("deny") || value.includes("sameorigin");
      })();

      const allowed = !(isBlockedByXfo || isBlockedByCsp);
      // Add meta CSP to reason if relevant
      const finalReason = !allowed
        ? isBlockedByXfo
          ? `X-Frame-Options: ${xFrameOptions}`
          : metaCsp && checkFrameAncestors(metaCsp)
          ? `Content-Security-Policy (meta): ${metaCsp}`
          : `Content-Security-Policy (header): ${headerCsp}`
        : undefined;

      logger.info(
        `Header check result: Allowed=${allowed}, Reason=${finalReason || "N/A"}, Title=${pageTitle || "N/A"}`,
        { finalUrl }
      );

      return { allowed, reason: finalReason, title: pageTitle };
    } catch (error) {
      // If fetching upstream headers failed, assume embedding is blocked
      logger.error(`Header check failed for ${targetUrl}`, error);
      // No title available on error
      return {
        allowed: false,
        reason: `Proxy check failed: ${(error as Error).message}`,
      };
    }
  };

  try {
    // 1. Pure header‑check mode
    if (mode === "check") {
      logger.info("Executing in 'check' mode");
      const result = await checkSiteEmbeddingAllowed();
      res.setHeader("Content-Type", "application/json");
      setDiagnosticsHeader(res, debugProxy, diagnostics);
      logger.response(200, Date.now() - startTime);
      return res.status(200).json(result);
    }

    // 2. Proxy mode – stream the upstream resource, removing blocking headers
    logger.info(`Executing in 'proxy' mode for: ${targetUrl}`);
    // Create an AbortController with timeout for the upstream fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30-second timeout

    try {
      const cookieJar = await loadProxyCookies(redis, proxySessionId);
      const cookieHeader = cookieJar
        ? getCookieHeaderForUrl(cookieJar.cookies, targetUrl)
        : null;
      const contentTypeHeader = getQueryValue(req.headers["content-type"]);
      const upstreamBody = method === "POST" ? await readProxyRequestBody(req) : undefined;
      const browserHeaders = buildBrowserHeaders({
        targetUrl,
        resourceType,
        referrerUrl,
        method,
        contentType: contentTypeHeader,
        cookieHeader,
      });
      const fixtureResponse = fixtureName
        ? createLocalProxyFixtureResponse(fixtureName, targetUrl, browserHeaders)
        : null;
      const { response: upstreamRes, finalUrl, redirectChain } =
        fixtureResponse ??
        (await safeFetchWithRedirects(
          targetUrl,
          {
            method,
            signal: controller.signal,
            headers: browserHeaders,
            body: upstreamBody,
          },
          { maxRedirects: 10 }
        ));

      clearTimeout(timeout); // Clear timeout on successful fetch
      diagnostics.upstreamStatus = upstreamRes.status;
      diagnostics.finalUrl = finalUrl;
      diagnostics.redirectCount = redirectChain.length;

      if (cookieJar) {
        const updatedCookies = mergeProxyCookies(
          cookieJar.cookies,
          getSetCookieHeaders(upstreamRes.headers),
          finalUrl
        );
        await redis.set(cookieJar.key, JSON.stringify(updatedCookies), {
          ex: 60 * 60 * 2,
        });
      }

      // If the upstream fetch failed (e.g., 403 Forbidden, 404 Not Found), return an error response
      if (!upstreamRes.ok) {
        logger.error(`Upstream fetch failed with status ${upstreamRes.status}`, { url: targetUrl });
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        diagnostics.errorType = "http_error";
        setDiagnosticsHeader(res, debugProxy, diagnostics);
        logger.response(upstreamRes.status, Date.now() - startTime);
        return res.status(upstreamRes.status).json({
          error: true,
          status: upstreamRes.status,
          statusText: upstreamRes.statusText || "File not found",
          type: "http_error",
          message: `The page cannot be found. HTTP ${upstreamRes.status} - ${
            upstreamRes.statusText || "File not found"
          }`,
        });
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      diagnostics.contentType = contentType;
      logger.info(`Proxying content type: ${contentType}`);
      let pageTitle: string | undefined = undefined; // Initialize title for proxy mode

      // Set response headers
      res.setHeader("content-security-policy", "frame-ancestors *");
      res.setHeader("access-control-allow-origin", "*");

      // If it's HTML, inject the <base> tag and click interceptor script
      if (contentType.includes("text/html")) {
        let html = await upstreamRes.text();

        // --- Sanitize HTML for proxy embedding ---
        // Strip existing <base> tags to prevent conflicts with our injected base tag
        html = html.replace(/<base\s[^>]*>/gi, '');
        // Strip meta CSP tags that block resource loading in proxied context
        html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');
        // Strip meta X-Frame-Options tags
        html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');
        // Strip meta refresh redirects (they bypass the proxy and cause broken navigation)
        html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');
        // Strip Content-Security-Policy headers embedded via <meta> with reversed attribute order
        html = html.replace(/<meta[^>]*content\s*=\s*["'][^"']*["'][^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');

        if (!isWaybackRequest && shouldUseInertProxyScripts(finalUrl)) {
          html = promoteNoscriptImageFallbacks(html);
          html = disableExecutableScripts(html);
        }

        const appPublicOrigin = getProxyAssetOrigin(origin);
        const rewriteResult = rewriteHtmlForProxy(html, {
          baseUrl: finalUrl,
          proxyOrigin: appPublicOrigin,
          referrerUrl: finalUrl,
          sessionId: proxySessionId,
          theme,
        });
        html = rewriteResult.html;
        diagnostics.rewrites = rewriteResult.stats;
        logger.info("Rewrote proxied HTML resources", rewriteResult.stats);

        // Extract title before modifying HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          pageTitle = decodeHtmlEntitiesOnce(titleMatch[1]).trim();
        }

        // Inject <base> tag right after <head> (case‑insensitive)
        const baseTag = `<base href="${finalUrl}">`;
        // Inject title meta tag if title was extracted
        const titleMetaTag = pageTitle
          ? `<meta name="page-title" content="${encodeURIComponent(
              pageTitle
            )}">`
          : "";

        // Add font override styles (conditionally injected based on theme)
        const fontOverrideStyles = shouldInjectFontOverrides
          ? `
<link rel="stylesheet" href="${appPublicOrigin}/fonts/fonts.css">
<style>img{image-rendering:pixelated!important}body,div,span,p,h1,h2,h3,h4,h5,h6,button,input,select,textarea,[style*="font-family"],[style*="sans-serif"],[style*="SF Pro Text"],[style*="-apple-system"],[style*="BlinkMacSystemFont"],[style*="Segoe UI"],[style*="Roboto"],[style*="Oxygen"],[style*="Ubuntu"],[style*="Cantarell"],[style*="Fira Sans"],[style*="Droid Sans"],[style*="Helvetica Neue"],[style*="Helvetica"],[style*="Arial"],[style*="Verdana"],[style*="Geneva"],[style*="Inter"],[style*="Hiragino Sans"],[style*="Hiragino Kaku Gothic"],[style*="Yu Gothic"],[style*="Meiryo"],[style*="MS PGothic"],[style*="MS Gothic"],[style*="Microsoft YaHei"],[style*="PingFang"],[style*="Noto Sans"],[style*="Source Han Sans"],[style*="WenQuanYi"]{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif!important}[style*="serif"],[style*="Georgia"],[style*="Times New Roman"],[style*="Times"],[style*="Palatino"],[style*="Bookman"],[style*="Garamond"],[style*="Cambria"],[style*="Constantia"],[style*="Hiragino Mincho"],[style*="Yu Mincho"],[style*="MS Mincho"],[style*="SimSun"],[style*="NSimSun"],[style*="Source Han Serif"],[style*="Noto Serif CJK"]{font-family:"Mondwest","Yu Mincho","Hiragino Mincho Pro","Songii TC","Georgia","Palatino","SerenityOS-Emoji",serif!important}code,pre,[style*="monospace"],[style*="Courier New"],[style*="Courier"],[style*="Lucida Console"],[style*="Monaco"],[style*="Consolas"],[style*="Inconsolata"],[style*="Source Code Pro"],[style*="Menlo"],[style*="Andale Mono"],[style*="Ubuntu Mono"]{font-family:"Monaco","ArkPixel","SerenityOS-Emoji",monospace!important}*{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif}</style>`
          : "";

        // Comprehensive navigation interceptor script - injected in head for early execution
        const navigationInterceptorScript = `
<script>
(function() {
  'use strict';

  // Save real parent reference BEFORE any overrides
  var realParent = window.parent;

  // Helper to resolve and post navigation URL to real parent
  function postNavigation(url, source) {
    try {
      var absoluteUrl = new URL(url, document.baseURI || window.location.href).href;
      if (absoluteUrl.startsWith('javascript:') ||
          absoluteUrl.startsWith('blob:') ||
          absoluteUrl.startsWith('data:') ||
          (absoluteUrl.indexOf('#') !== -1 && absoluteUrl.split('#')[0] === window.location.href.split('#')[0])) {
        return false;
      }
      realParent.postMessage({ type: 'iframeNavigation', url: absoluteUrl, source: source }, '*');
      return true;
    } catch (e) {
      return false;
    }
  }

  var readyPosted = false;
  function postReady(source) {
    if (readyPosted) return;
    readyPosted = true;
    try {
      var metaTitle = document.querySelector('meta[name="page-title"]');
      realParent.postMessage({
        type: 'iframeReady',
        title: document.title || (metaTitle && metaTitle.getAttribute('content')) || '',
        source: source
      }, '*');
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { postReady('dom-content-loaded'); }, { once: true });
  } else {
    setTimeout(function() { postReady('already-ready'); }, 0);
  }

  // Some pages keep subresources pending for a long time; unblock ryOS once
  // the static document has had a chance to paint.
  setTimeout(function() { postReady('timeout'); }, 1500);

  // --- Frame-busting neutralization ---
  // Make the page think it is the top-level window so that
  // "if (top !== self) top.location = ..." guards become no-ops.
  try {
    Object.defineProperty(window, 'top', {
      get: function() { return window.self; },
      configurable: true
    });
  } catch(e) {}

  try {
    Object.defineProperty(window, 'parent', {
      get: function() { return window.self; },
      configurable: true
    });
  } catch(e) {}

  try {
    Object.defineProperty(window, 'frameElement', {
      get: function() { return null; },
      configurable: true
    });
  } catch(e) {}

  // --- Block Service Worker registration (prevents SW interference in proxied context) ---
  try {
    var fakeReg = {
      installing: null, waiting: null, active: null, scope: '',
      unregister: function() { return Promise.resolve(true); },
      update: function() { return Promise.resolve(); },
      addEventListener: function() {}, removeEventListener: function() {}
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      get: function() {
        return {
          register: function() { return Promise.resolve(fakeReg); },
          getRegistration: function() { return Promise.resolve(undefined); },
          getRegistrations: function() { return Promise.resolve([]); },
          ready: Promise.resolve(fakeReg),
          controller: null,
          addEventListener: function() {}, removeEventListener: function() {}
        };
      },
      configurable: true
    });
  } catch(e) {}

  // --- Suppress Notification / Push permission requests ---
  try {
    if (window.Notification) {
      window.Notification.requestPermission = function() { return Promise.resolve('denied'); };
    }
  } catch(e) {}

  // --- Click interceptor (capture phase for highest priority) ---
  function handleClick(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.button !== 0) return;

    var target = event.target;
    var anchor = null;

    while (target && target !== document.documentElement) {
      if (target.tagName === 'A' && target.href) {
        anchor = target;
        break;
      }
      target = target.parentElement;
    }

    if (anchor && anchor.href) {
      var href = anchor.getAttribute('href');
      if (postNavigation(href, 'click')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
  }

  // --- Form submission interceptor ---
  function handleSubmit(event) {
    var form = event.target;
    if (form && form.tagName === 'FORM') {
      var action = form.getAttribute('action') || window.location.href;
      var method = (form.getAttribute('method') || 'GET').toUpperCase();

      if (method === 'GET') {
        var formData = new FormData(form);
        var params = new URLSearchParams();
        formData.forEach(function(value, key) {
          params.append(key, value);
        });
        var url = action + (action.indexOf('?') === -1 ? '?' : '&') + params.toString();
        if (postNavigation(url, 'form-get')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }
    }
  }

  // --- Mousedown interceptor for middle-click ---
  function handleMouseDown(event) {
    if (event.button === 1) {
      var target = event.target;
      while (target && target !== document.documentElement) {
        if (target.tagName === 'A' && target.href) {
          var href = target.getAttribute('href');
          if (postNavigation(href, 'middle-click')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          }
          break;
        }
        target = target.parentElement;
      }
    }
  }

  document.addEventListener('click', handleClick, true);
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  window.addEventListener('click', handleClick, true);

  setInterval(function() {
    document.removeEventListener('click', handleClick, true);
    document.addEventListener('click', handleClick, true);
  }, 2000);

  // --- Patch window.location assignments ---
  var locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  if (locationDescriptor && locationDescriptor.configurable !== false) {
    try {
      var originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        get: function() { return originalLocation; },
        set: function(url) {
          if (postNavigation(url, 'location-set')) return;
          originalLocation.href = url;
        },
        configurable: true
      });
    } catch (e) {}
  }

  try {
    var loc = window.location;
    var originalAssign = loc.assign;
    var originalReplace = loc.replace;

    if (originalAssign) {
      loc.assign = function(url) {
        if (!postNavigation(url, 'location-assign')) {
          originalAssign.call(loc, url);
        }
      };
    }

    if (originalReplace) {
      loc.replace = function(url) {
        if (!postNavigation(url, 'location-replace')) {
          originalReplace.call(loc, url);
        }
      };
    }

    var hrefDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(loc), 'href');
    if (hrefDescriptor && hrefDescriptor.set) {
      var originalHrefSetter = hrefDescriptor.set;
      Object.defineProperty(loc, 'href', {
        get: function() { return loc.href; },
        set: function(url) {
          if (!postNavigation(url, 'location-href')) {
            originalHrefSetter.call(loc, url);
          }
        },
        configurable: true
      });
    }
  } catch (e) {}

  // --- Patch history API to avoid cross-origin SecurityError ---
  var makeRelative = function(url) {
    try {
      if (!url) return url;
      var parsed = new URL(url, document.baseURI);
      if (parsed.origin !== window.location.origin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (e) {}
    return url;
  };

  ['pushState', 'replaceState'].forEach(function(fn) {
    var original = history[fn];
    if (typeof original === 'function') {
      history[fn] = function(state, title, url) {
        try {
          return original.call(this, state, title, makeRelative(url));
        } catch (err) {
          return original.call(this, state, title, null);
        }
      };
    }
  });

  // --- Intercept window.open ---
  var originalOpen = window.open;
  window.open = function(url, target, features) {
    if (url && postNavigation(url, 'window-open')) return null;
    return originalOpen ? originalOpen.call(window, url, target, features) : null;
  };

  // --- Sub-resource proxy: route dynamic fetch/XHR GETs through the proxy ---
  var proxyOrigin = window.location.origin;
  var baseOrigin = null;
  var proxySession = ${JSON.stringify(proxySessionId || "")};
  var proxyTheme = ${JSON.stringify(theme || "")};
  try { baseOrigin = new URL(document.baseURI).origin; } catch(e) {}

  function buildProxyUrl(url, resourceType) {
    var resolved = new URL(url, document.baseURI);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    var proxyUrl = new URL('/api/iframe-check', proxyOrigin);
    proxyUrl.searchParams.set('url', resolved.href);
    proxyUrl.searchParams.set('resource', resourceType || 'xhr');
    proxyUrl.searchParams.set('ref', document.baseURI || window.location.href);
    if (proxySession) proxyUrl.searchParams.set('session', proxySession);
    if (proxyTheme) proxyUrl.searchParams.set('theme', proxyTheme);
    return proxyUrl.toString();
  }

  if (baseOrigin && baseOrigin !== proxyOrigin) {
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      try {
        var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
        var method = 'GET';
        if (init && init.method) method = init.method.toUpperCase();
        else if (input instanceof Request) method = input.method.toUpperCase();

        if (method === 'GET') {
          var proxyUrl = buildProxyUrl(url, 'xhr');
          if (!proxyUrl) return origFetch.call(window, input, init);
          return origFetch.call(window, proxyUrl, init);
        }
      } catch(e) {}
      return origFetch.call(window, input, init);
    };

    var origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
      try {
        var method = arguments[0];
        var url = arguments[1];
        if (typeof url === 'string' && method && method.toUpperCase() === 'GET') {
          var proxyUrl = buildProxyUrl(url, 'xhr');
          if (proxyUrl) arguments[1] = proxyUrl;
        }
      } catch(e) {}
      return origXHROpen.apply(this, arguments);
    };
  }
})();
</script>
`;
        const headIndex = html.search(/<head[^>]*>/i);
        if (headIndex !== -1) {
          const insertPos = headIndex + html.match(/<head[^>]*>/i)![0].length;
          // Inject navigation interceptor as early as possible in head
          html =
            html.slice(0, insertPos) +
            baseTag +
            titleMetaTag +
            navigationInterceptorScript +
            fontOverrideStyles +
            html.slice(insertPos);
        } else {
          // Fallback: Prepend if no <head> - wrap in head tag
          html =
            '<head>' +
            baseTag +
            titleMetaTag +
            navigationInterceptorScript +
            fontOverrideStyles +
            '</head>' +
            html;
        }

        // Add the extracted title to a custom header (URL-encoded)
        if (pageTitle) {
          res.setHeader("X-Proxied-Page-Title", encodeURIComponent(pageTitle));
        }

        // Cache Wayback content *after* successful fetch and modification
        if (
          isWaybackRequest &&
          waybackYear &&
          waybackMonth &&
          contentType.includes("text/html")
        ) {
          try {
            logger.info(`Attempting to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`);
            const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
            if (normalizedUrlForKey) {
              const cacheKey = await getWaybackCacheKey(
                normalizedUrlForKey,
                `${waybackYear}${waybackMonth}`
              );
              logger.info(`Writing to Wayback cache key: ${cacheKey} (content length: ${html.length})`);
              // Use SET with expiration for Wayback cache (e.g., 30 days)
              await redis.set(cacheKey, html, { ex: 60 * 60 * 24 * 30 });
              logger.info(`Successfully cached Wayback content for ${cacheKey}`);
            } else {
              logger.info(`Skipped Wayback caching - URL normalization failed: ${normalizedUrl}`);
            }
          } catch (cacheErr) {
            logger.error(`Failed to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`, cacheErr);
          }
        }

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        setDiagnosticsHeader(res, debugProxy, diagnostics);
        logger.response(upstreamRes.status, Date.now() - startTime);
        return res.status(upstreamRes.status).send(html);
      } else if (contentType.includes("text/css")) {
        const css = await upstreamRes.text();
        const appPublicOrigin = getProxyAssetOrigin(origin);
        const rewriteResult = rewriteCssForProxy(css, {
          baseUrl: finalUrl,
          proxyOrigin: appPublicOrigin,
          referrerUrl: finalUrl,
          sessionId: proxySessionId,
        });
        diagnostics.rewrites = {
          ...emptyRewriteStats(),
          cssUrls: rewriteResult.count,
        };
        res.setHeader("Content-Type", contentType || "text/css; charset=utf-8");
        setDiagnosticsHeader(res, debugProxy, diagnostics);
        logger.response(upstreamRes.status, Date.now() - startTime);
        return res.status(upstreamRes.status).send(rewriteResult.css);
      } else {
        logger.info("Proxying non-HTML content directly");
        // For non‑HTML content, stream the body directly
        const arrayBuffer = await upstreamRes.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        diagnostics.rewrites = emptyRewriteStats();
        setDiagnosticsHeader(res, debugProxy, diagnostics);
        logger.response(upstreamRes.status, Date.now() - startTime);
        return res.status(upstreamRes.status).send(Buffer.from(arrayBuffer));
      }
    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError instanceof SsrfBlockedError) {
        logger.warn(`Proxy blocked SSRF target for ${targetUrl}`, fetchError);
        res.setHeader("Content-Type", "application/json");
        if (effectiveOrigin) {
          res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
        }
        diagnostics.errorType = "ssrf_blocked";
        setDiagnosticsHeader(res, debugProxy, diagnostics);
        logger.response(400, Date.now() - startTime);
        return res.status(400).json({
          error: true,
          type: "ssrf_blocked",
          status: 400,
          message: fetchError.message,
        });
      }

      // Special handling for timeout or network errors
      logger.error(`Proxy fetch error for ${targetUrl}`, fetchError);

      // Return JSON with error information instead of HTML
      res.setHeader("Content-Type", "application/json");
      if (effectiveOrigin) {
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
      }
      diagnostics.errorType = "connection_error";
      setDiagnosticsHeader(res, debugProxy, diagnostics);
      logger.response(503, Date.now() - startTime);
      return res.status(503).json({
        error: true,
        type: "connection_error",
        status: 503,
        message:
          "The page cannot be displayed. Internet Explorer cannot access this website.",
        // Include the target URL in the details for better debugging
        details: `Failed to fetch the requested URL. Reason: ${
          fetchError instanceof Error
            ? fetchError.message
            : "Connection failed or timed out"
        }`,
      });
    }
  } catch (error) {
    logger.error("General handler error", error);
    return errorResponseWithCors((error as Error).message, 500);
  }
  }
);
