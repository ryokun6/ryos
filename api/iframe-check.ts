// No Next.js types needed – omit unused import to keep file framework‑agnostic.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { isAllowedOrigin, getEffectiveOrigin } from "./_utils/_cors.js";
import { normalizeUrlForCacheKey } from "./_utils/_url.js";
import { initLogger } from "./_utils/_logging.js";

export const runtime = "nodejs";

// ============================================================================
// Local Helper Functions
// ============================================================================

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

// --- Utility Functions ----------------------------------------------------

/**
 * List of domains that should be automatically proxied.
 * Domains should be lowercase and without protocol.
 */
const AUTO_PROXY_DOMAINS = [
  "wikipedia.org",
  "wikimedia.org",
  "wikipedia.com",
  "cursor.com",
  // Add more domains as needed
];

/**
 * Check if a URL's domain matches or is a subdomain of any auto-proxy domain
 */
const shouldAutoProxy = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return AUTO_PROXY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    // Return false if URL parsing fails
    return false;
  }
};

// ------------------------------------------------------------------------
// Dynamic browser header generation
// ------------------------------------------------------------------------
/** A curated list of realistic desktop browser fingerprints to rotate through. */
const USER_AGENT_SAMPLES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"',
    platform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    // Safari does not currently send Sec-CH-UA headers
    secChUa: "",
    platform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
    platform: '"Linux"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    // Firefox also omits Sec-CH-UA headers
    secChUa: "",
    platform: '"Windows"',
  },
];

const ACCEPT_LANGUAGE_SAMPLES = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.8",
  "en-US,en;q=0.8,fr;q=0.6",
  "en-US,en;q=0.8,de;q=0.6",
];

const SEC_FETCH_SITE_SAMPLES = ["none", "same-origin", "cross-site"];

// Generic helper to pick a random member of an array
const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

/**
 * Builds a pseudo-random, yet realistic, browser header set.
 * We purposefully limit the pool to a handful of common fingerprints so that
 * the generated headers stay coherent and pass basic heuristics.
 */
const generateRandomBrowserHeaders = (): Record<string, string> => {
  const fp = pickRandom(USER_AGENT_SAMPLES);

  const headers: Record<string, string> = {
    "User-Agent": fp.ua,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": pickRandom(ACCEPT_LANGUAGE_SAMPLES),
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": pickRandom(SEC_FETCH_SITE_SAMPLES),
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  // Only attach Client-Hint headers if present in the selected fingerprint
  if (fp.secChUa) {
    headers["Sec-Ch-Ua"] = fp.secChUa;
    headers["Sec-Ch-Ua-Mobile"] = "?0";
    headers["Sec-Ch-Ua-Platform"] = fp.platform;
  }

  return headers;
};

// --- Constants ---
const IE_CACHE_PREFIX = "ie:cache:";
const WAYBACK_CACHE_PREFIX = "wayback:cache:";
// --- End Constants ---

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const urlParam = req.query.url as string | undefined;
  let mode = (req.query.mode as string | undefined) || "proxy"; // "check" | "proxy" | "ai" | "list-cache"
  const year = req.query.year as string | undefined;
  const month = req.query.month as string | undefined;
  const effectiveOrigin = getEffectiveOrigin(req);
  
  logger.request(req.method || "GET", req.url || "/api/iframe-check", mode);
  
  if (!isAllowedOrigin(effectiveOrigin)) {
    logger.warn("Unauthorized origin", { effectiveOrigin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).send("Unauthorized");
  }

  // Generate a fresh, randomized browser header set for this request
  const BROWSER_HEADERS = generateRandomBrowserHeaders();

  // Helper for consistent error responses with CORS
  const errorResponseWithCors = (message: string, status: number = 400) => {
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

  // Ensure the URL starts with a protocol for fetch()
  const normalizedUrl = urlParam.startsWith("http")
    ? urlParam
    : `https://${urlParam}`;

  // Log normalized URL
  logger.info(`Normalized URL: ${normalizedUrl}`);

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
      const redis = createRedis();
      const key = `${IE_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:${year}`;
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
      const redis = createRedis();

      const uniqueYears = new Set<string>();

      // Scan for AI Cache keys (ie:cache:...)
      const aiPattern = `${IE_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:*`;
      const aiKeyPrefixLength = `${IE_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:`.length;
      logger.info(`Scanning Redis for AI cache with pattern: ${aiPattern}`);
      let aiCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(aiCursor, {
          match: aiPattern,
          count: 100,
        });
        aiCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearPart = key.substring(aiKeyPrefixLength);
          // Validate AI year (YYYY, YYYY BC, or Y CE)
          if (yearPart && /^(\d{1,4}( BC)?|\d+ CE)$/.test(yearPart)) {
            uniqueYears.add(yearPart);
          } else {
            logger.info(`Skipping invalid AI year format in key: ${key}`);
          }
        }
      } while (aiCursor !== 0);

      // Scan for Wayback Cache keys (wayback:cache:...)
      const waybackPattern = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:*`;
      const waybackKeyPrefixLength =
        `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:`
          .length;
      logger.info(`Scanning Redis for Wayback cache with pattern: ${waybackPattern}`);
      let waybackCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(waybackCursor, {
          match: waybackPattern,
          count: 100,
        });
        waybackCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearMonthPart = key.substring(waybackKeyPrefixLength);
          // Validate Wayback year-month (YYYYMM) and extract year
          if (yearMonthPart && /^\d{6}$/.test(yearMonthPart)) {
            const yearExtracted = yearMonthPart.substring(0, 4);
            uniqueYears.add(yearExtracted);
          } else {
            logger.info(`Skipping invalid Wayback year-month format in key: ${key}`);
          }
        }
      } while (waybackCursor !== 0);

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
  const isAutoProxyDomain = shouldAutoProxy(normalizedUrl);
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
      const redis = createRedis();
      const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
      if (normalizedUrlForKey) {
        const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
          normalizedUrlForKey
        )}:${waybackYear}${waybackMonth}`;
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
      const fetchRes = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        headers: BROWSER_HEADERS, // Add browser headers
      });

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
          // Basic sanitization: decode HTML entities and trim whitespace
          try {
            // Use a simple approach for common entities; full decoding might need a library
            pageTitle = titleMatch[1]
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
          } catch (e) {
            console.error("Error decoding title:", e);
            pageTitle = titleMatch[1].trim(); // Fallback to raw title
          }
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

      logger.info(`Header check result: Allowed=${allowed}, Reason=${finalReason || "N/A"}, Title=${pageTitle || "N/A"}`);

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
      logger.response(200, Date.now() - startTime);
      return res.status(200).json(result);
    }

    // 2. Proxy mode – stream the upstream resource, removing blocking headers
    logger.info(`Executing in 'proxy' mode for: ${targetUrl}`);
    // Create an AbortController with timeout for the upstream fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15-second timeout

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: BROWSER_HEADERS, // Add browser headers
      });

      clearTimeout(timeout); // Clear timeout on successful fetch

      // If the upstream fetch failed (e.g., 403 Forbidden, 404 Not Found), return an error response
      if (!upstreamRes.ok) {
        logger.error(`Upstream fetch failed with status ${upstreamRes.status}`, { url: targetUrl });
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
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
      logger.info(`Proxying content type: ${contentType}`);
      let pageTitle: string | undefined = undefined; // Initialize title for proxy mode

      // Set response headers
      res.setHeader("content-security-policy", "frame-ancestors *; sandbox allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock");
      res.setHeader("access-control-allow-origin", "*");

      // If it's HTML, inject the <base> tag and click interceptor script
      if (contentType.includes("text/html")) {
        let html = await upstreamRes.text();

        // Extract title before modifying HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          try {
            pageTitle = titleMatch[1]
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim();
          } catch (e) {
            console.error("Error decoding title in proxy:", e);
            pageTitle = titleMatch[1].trim(); // Fallback
          }
        }

        // Inject <base> tag right after <head> (case‑insensitive)
        const baseTag = `<base href="${targetUrl}">`;
        // Inject title meta tag if title was extracted
        const titleMetaTag = pageTitle
          ? `<meta name="page-title" content="${encodeURIComponent(
              pageTitle
            )}">`
          : "";

        // Add font override styles (conditionally injected based on theme)
        const fontOverrideStyles = shouldInjectFontOverrides
          ? `
<link rel="stylesheet" href="https://os.ryo.lu/fonts/fonts.css">
<style>img{image-rendering:pixelated!important}body,div,span,p,h1,h2,h3,h4,h5,h6,button,input,select,textarea,[style*="font-family"],[style*="sans-serif"],[style*="SF Pro Text"],[style*="-apple-system"],[style*="BlinkMacSystemFont"],[style*="Segoe UI"],[style*="Roboto"],[style*="Oxygen"],[style*="Ubuntu"],[style*="Cantarell"],[style*="Fira Sans"],[style*="Droid Sans"],[style*="Helvetica Neue"],[style*="Helvetica"],[style*="Arial"],[style*="Verdana"],[style*="Geneva"],[style*="Inter"],[style*="Hiragino Sans"],[style*="Hiragino Kaku Gothic"],[style*="Yu Gothic"],[style*="Meiryo"],[style*="MS PGothic"],[style*="MS Gothic"],[style*="Microsoft YaHei"],[style*="PingFang"],[style*="Noto Sans"],[style*="Source Han Sans"],[style*="WenQuanYi"]{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif!important}[style*="serif"],[style*="Georgia"],[style*="Times New Roman"],[style*="Times"],[style*="Palatino"],[style*="Bookman"],[style*="Garamond"],[style*="Cambria"],[style*="Constantia"],[style*="Hiragino Mincho"],[style*="Yu Mincho"],[style*="MS Mincho"],[style*="SimSun"],[style*="NSimSun"],[style*="Source Han Serif"],[style*="Noto Serif CJK"]{font-family:"Mondwest","Yu Mincho","Hiragino Mincho Pro","Songii TC","Georgia","Palatino","SerenityOS-Emoji",serif!important}code,pre,[style*="monospace"],[style*="Courier New"],[style*="Courier"],[style*="Lucida Console"],[style*="Monaco"],[style*="Consolas"],[style*="Inconsolata"],[style*="Source Code Pro"],[style*="Menlo"],[style*="Andale Mono"],[style*="Ubuntu Mono"]{font-family:"Monaco","ArkPixel","SerenityOS-Emoji",monospace!important}*{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif}</style>`
          : "";

        // Comprehensive navigation interceptor script - injected in head for early execution
        const navigationInterceptorScript = `
<script>
(function() {
  'use strict';
  
  // Helper to resolve and post navigation URL to parent
  function postNavigation(url, source) {
    try {
      var absoluteUrl = new URL(url, document.baseURI || window.location.href).href;
      // Skip javascript: URLs, anchors, and blob/data URLs
      if (absoluteUrl.startsWith('javascript:') || 
          absoluteUrl.startsWith('blob:') || 
          absoluteUrl.startsWith('data:') ||
          (absoluteUrl.indexOf('#') !== -1 && absoluteUrl.split('#')[0] === window.location.href.split('#')[0])) {
        return false;
      }
      window.parent.postMessage({ type: 'iframeNavigation', url: absoluteUrl, source: source }, '*');
      return true;
    } catch (e) {
      console.error('[IE Proxy] Error posting navigation:', e);
      return false;
    }
  }
  
  // Click interceptor - capture phase for highest priority
  function handleClick(event) {
    // Skip if modifier keys are pressed (let browser handle new tab/window)
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    // Only handle left clicks
    if (event.button !== 0) return;
    
    var target = event.target;
    var anchor = null;
    
    // Walk up the DOM tree to find an anchor element
    while (target && target !== document.documentElement) {
      if (target.tagName === 'A' && target.href) {
        anchor = target;
        break;
      }
      // Check for elements with onclick that navigate
      target = target.parentElement;
    }
    
    if (anchor && anchor.href) {
      var href = anchor.getAttribute('href');
      // Skip if target is _blank or similar
      var linkTarget = anchor.getAttribute('target');
      if (linkTarget === '_blank' || linkTarget === '_top' || linkTarget === '_parent') {
        // Still intercept but let parent decide
      }
      
      if (postNavigation(href, 'click')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
  }
  
  // Form submission interceptor
  function handleSubmit(event) {
    var form = event.target;
    if (form && form.tagName === 'FORM') {
      var action = form.getAttribute('action') || window.location.href;
      var method = (form.getAttribute('method') || 'GET').toUpperCase();
      
      if (method === 'GET') {
        // For GET forms, construct the URL with query params
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
      // For POST forms, let them go through (they'll be blocked by CORS anyway)
    }
  }
  
  // Mousedown interceptor for middle-click
  function handleMouseDown(event) {
    if (event.button === 1) { // Middle click
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
  
  // Add event listeners with capture phase for highest priority
  document.addEventListener('click', handleClick, true);
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  
  // Also listen on window in case document listeners are removed
  window.addEventListener('click', handleClick, true);
  
  // Re-add listeners periodically in case site removes them
  setInterval(function() {
    document.removeEventListener('click', handleClick, true);
    document.addEventListener('click', handleClick, true);
  }, 2000);
  
  // Patch window.location assignments
  var locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  if (locationDescriptor && locationDescriptor.configurable !== false) {
    try {
      var originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        get: function() { return originalLocation; },
        set: function(url) {
          if (postNavigation(url, 'location-set')) {
            return;
          }
          originalLocation.href = url;
        },
        configurable: true
      });
    } catch (e) {
      // Location override failed, continue without it
    }
  }
  
  // Patch location.href, location.assign, location.replace
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
    
    // Try to intercept href setter
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
  } catch (e) {
    // Location patching failed, continue without it
  }
  
  // Patch history API to avoid cross-origin SecurityError (e.g. Next.js apps inside proxy)
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
          console.warn('[IE Proxy] history.' + fn + ' blocked URL', url, err);
          return original.call(this, state, title, null);
        }
      };
    }
  });
  
  // Intercept window.open
  var originalOpen = window.open;
  window.open = function(url, target, features) {
    if (url && postNavigation(url, 'window-open')) {
      return null;
    }
    return originalOpen ? originalOpen.call(window, url, target, features) : null;
  };
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
            const redis = new Redis({
              url: process.env.REDIS_KV_REST_API_URL as string,
              token: process.env.REDIS_KV_REST_API_TOKEN as string,
            });
            const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
            if (normalizedUrlForKey) {
              const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
                normalizedUrlForKey
              )}:${waybackYear}${waybackMonth}`;
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
        logger.response(upstreamRes.status, Date.now() - startTime);
        return res.status(upstreamRes.status).send(html);
      } else {
        logger.info("Proxying non-HTML content directly");
        // For non‑HTML content, stream the body directly
        const arrayBuffer = await upstreamRes.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        logger.response(upstreamRes.status, Date.now() - startTime);
        return res.status(upstreamRes.status).send(Buffer.from(arrayBuffer));
      }
    } catch (fetchError) {
      clearTimeout(timeout);

      // Special handling for timeout or network errors
      logger.error(`Proxy fetch error for ${targetUrl}`, fetchError);

      // Return JSON with error information instead of HTML
      res.setHeader("Content-Type", "application/json");
      if (effectiveOrigin) {
        res.setHeader("Access-Control-Allow-Origin", effectiveOrigin);
      }
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
