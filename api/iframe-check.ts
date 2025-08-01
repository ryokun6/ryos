// No Next.js types needed – omit unused import to keep file framework‑agnostic.

import { Redis } from "@upstash/redis"; // Use direct import
import * as RateLimit from "./utils/rate-limit";

export const config = {
  runtime: "edge",
};

import { normalizeUrlForCacheKey } from "./utils/url"; // Import the function

// --- Logging Utilities ---------------------------------------------------

const logRequest = (
  method: string,
  url: string,
  action: string | null,
  id: string
) => {
  console.log(`[${id}] ${method} ${url} - Action: ${action || "none"}`);
};

const logInfo = (id: string, message: string, data?: unknown) => {
  console.log(`[${id}] INFO: ${message}`, data ?? "");
};

const logError = (id: string, message: string, error: unknown) => {
  console.error(`[${id}] ERROR: ${message}`, error);
};

const generateRequestId = (): string =>
  Math.random().toString(36).substring(2, 10);

// Helper function to ensure CORS headers are always included
const corsHeaders = (additionalHeaders: Record<string, string> = {}) => {
  return {
    "Access-Control-Allow-Origin": "*",
    ...additionalHeaders,
  };
};

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

export default async function handler(req: Request) {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get("url");
  let mode = searchParams.get("mode") || "proxy"; // "check" | "proxy" | "ai" | "list-cache"
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const requestId = generateRequestId(); // Generate request ID
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  
  // Log headers for debugging
  logInfo(requestId, `Request headers - Origin: ${origin}, Referer: ${referer}, Host: ${req.headers.get('host')}`);
  
  // Check both origin and referer for more flexibility
  const ALLOWED_ORIGINS = new Set([
    "https://os.ryo.lu", 
    "https://ryo.lu", 
    "http://os.ryo.lu", 
    "http://ryo.lu", 
    "http://localhost:3000"
  ]);
  const ALLOWED_DOMAINS = ["os.ryo.lu", "ryo.lu", "localhost"];
  
  let isAllowed = false;
  
  // Check origin header
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    isAllowed = true;
    logInfo(requestId, `Allowed by origin: ${origin}`);
  }
  
  // Check referer as fallback
  if (!isAllowed && referer) {
    try {
      const refererUrl = new URL(referer);
      if (ALLOWED_DOMAINS.some(domain => refererUrl.hostname === domain || refererUrl.hostname.endsWith(`.${domain}`))) {
        isAllowed = true;
        logInfo(requestId, `Allowed by referer: ${referer}`);
      }
    } catch (e) {
      logError(requestId, `Invalid referer URL: ${referer}`, e);
    }
  }
  
  // Check host header as another fallback (for same-origin requests)
  if (!isAllowed) {
    const host = req.headers.get('host');
    if (host && ALLOWED_DOMAINS.some(domain => host === domain || host.startsWith(`${domain}:`))) {
      isAllowed = true;
      logInfo(requestId, `Allowed by host header: ${host}`);
    }
  }
  
  if (!isAllowed) {
    logError(requestId, `Unauthorized request - Origin: ${origin}, Referer: ${referer}`, null);
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Still send CORS headers for proper error handling
      }
    });
  }

  // Generate a fresh, randomized browser header set for this request
  const BROWSER_HEADERS = generateRandomBrowserHeaders();

  // Log incoming request
  logRequest(req.method, req.url, mode, requestId);

  if (!urlParam) {
    logError(requestId, "Missing 'url' query parameter", null);
    return new Response(
      JSON.stringify({ error: "Missing 'url' query parameter" }),
      {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
      }
    );
  }

  // Ensure the URL starts with a protocol for fetch()
  const normalizedUrl = urlParam.startsWith("http")
    ? urlParam
    : `https://${urlParam}`;

  // Log normalized URL
  logInfo(requestId, `Normalized URL: ${normalizedUrl}`);

  // ---------------------------
  // Rate limiting (mode-specific)
  // ---------------------------
  try {
    const ip = RateLimit.getClientIp(req);
    const BURST_WINDOW = 60; // 1 minute
    const burstKeyBase = ["rl", "iframe", mode, "ip", ip];

    if (mode === "proxy" || mode === "check") {
      // Global per-IP burst
      const globalKey = RateLimit.makeKey(burstKeyBase);
      const global = await RateLimit.checkCounterLimit({
        key: globalKey,
        windowSeconds: BURST_WINDOW,
        limit: 30,
      });
      if (!global.allowed) {
        return new Response(
          JSON.stringify({ error: "rate_limit_exceeded", scope: "global", mode }),
          { status: 429, headers: corsHeaders({ "Retry-After": String(global.resetSeconds ?? BURST_WINDOW), "Content-Type": "application/json" }) }
        );
      }

      // Per-host anti-scrape if URL present
      try {
        const hostname = new URL(urlParam.startsWith("http") ? urlParam : `https://${urlParam}`).hostname.toLowerCase();
        const hostKey = RateLimit.makeKey(["rl", "iframe", mode, "ip", ip, "host", hostname]);
        const host = await RateLimit.checkCounterLimit({
          key: hostKey,
          windowSeconds: BURST_WINDOW,
          limit: 10,
        });
        if (!host.allowed) {
          return new Response(
            JSON.stringify({ error: "rate_limit_exceeded", scope: "host", host: hostname, mode }),
            { status: 429, headers: corsHeaders({ "Retry-After": String(host.resetSeconds ?? BURST_WINDOW), "Content-Type": "application/json" }) }
          );
        }
      } catch (e) {
        // Ignore invalid URL parse or missing hostname
        void e;
      }
    } else if (mode === "ai" || mode === "list-cache") {
      const key = RateLimit.makeKey(burstKeyBase);
      const res = await RateLimit.checkCounterLimit({
        key,
        windowSeconds: BURST_WINDOW,
        limit: 10,
      });
      if (!res.allowed) {
        return new Response(
          JSON.stringify({ error: "rate_limit_exceeded", scope: mode }),
          { status: 429, headers: corsHeaders({ "Retry-After": String(res.resetSeconds ?? BURST_WINDOW), "Content-Type": "application/json" }) }
        );
      }
    }
  } catch (e) {
    logError(requestId, "Rate limit check failed (iframe-check)", e);
  }

  // --- AI cache retrieval mode (PRIORITIZE THIS) ---
  if (mode === "ai") {
    const aiUrl = normalizedUrl;
    if (!year) {
      logError(requestId, "Missing year for AI cache mode", { year });
      return new Response(JSON.stringify({ error: "Missing year parameter" }), {
        status: 400,
        headers: corsHeaders({ "Content-Type": "application/json" }),
      });
    }

    // Validate year format
    const isValidYear =
      /^\d{1,4}( BC)?$/.test(year) || // Handles "500", "800", "1000 BC" etc.
      /^\d+ CE$/.test(year) || // Handles "1 CE"
      year === "current"; // Special case

    if (!isValidYear) {
      logError(requestId, "Invalid year format for AI cache mode", { year });
      return new Response(JSON.stringify({ error: "Invalid year format" }), {
        status: 400,
        headers: corsHeaders({ "Content-Type": "application/json" }),
      });
    }

    // Normalize the URL for the cache key
    const normalizedUrlForKey = normalizeUrlForCacheKey(aiUrl);
    logInfo(
      requestId,
      `Normalized URL for AI cache key: ${normalizedUrlForKey}`
    );

    if (!normalizedUrlForKey) {
      // Handle case where normalization failed
      logError(requestId, "URL normalization failed for AI cache key", null);
      return new Response(
        JSON.stringify({ error: "URL normalization failed" }),
        { status: 500, headers: corsHeaders({ "Content-Type": "application/json" }) }
      );
    }

    try {
      const redis = new Redis({
        url: process.env.REDIS_KV_REST_API_URL as string,
        token: process.env.REDIS_KV_REST_API_TOKEN as string,
      });
      const key = `${IE_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:${year}`;
      logInfo(requestId, `Checking AI cache with key: ${key}`);
      const html = (await redis.lindex(key, 0)) as string | null;
      if (html) {
        logInfo(requestId, `AI Cache HIT for key: ${key}`);
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "X-AI-Cache": "HIT",
          },
        });
      }
      logInfo(requestId, `AI Cache MISS for key: ${key}`);
      return new Response(JSON.stringify({ aiCache: false }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      logError(requestId, "Error checking AI cache", e);
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500,
        headers: corsHeaders({ "Content-Type": "application/json" }),
      });
    }
  }

  // --- List Cache mode (Combined AI and Wayback) ---
  if (mode === "list-cache") {
    const listUrl = normalizedUrl;
    logInfo(requestId, `Executing in 'list-cache' mode for: ${listUrl}`);

    const normalizedUrlForKey = normalizeUrlForCacheKey(listUrl);
    logInfo(
      requestId,
      `Normalized URL for list-cache key: ${normalizedUrlForKey}`
    );
    if (!normalizedUrlForKey) {
      logError(requestId, "URL normalization failed for list-cache key", null);
      return new Response(
        JSON.stringify({ error: "URL normalization failed" }),
        { status: 500, headers: corsHeaders({ "Content-Type": "application/json" }) }
      );
    }

    try {
      const redis = new Redis({
        url: process.env.REDIS_KV_REST_API_URL as string,
        token: process.env.REDIS_KV_REST_API_TOKEN as string,
      });

      const uniqueYears = new Set<string>();

      // Scan for AI Cache keys (ie:cache:...)
      const aiPattern = `${IE_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:*`;
      const aiKeyPrefixLength = `${IE_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:`.length;
      logInfo(
        requestId,
        `Scanning Redis for AI cache with pattern: ${aiPattern}`
      );
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
            logInfo(
              requestId,
              `Skipping invalid AI year format in key: ${key}`
            );
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
      logInfo(
        requestId,
        `Scanning Redis for Wayback cache with pattern: ${waybackPattern}`
      );
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
            const year = yearMonthPart.substring(0, 4);
            uniqueYears.add(year);
          } else {
            logInfo(
              requestId,
              `Skipping invalid Wayback year-month format in key: ${key}`
            );
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

      logInfo(
        requestId,
        `Found ${sortedYears.length} unique cached years for URL: ${listUrl}`
      );

      return new Response(JSON.stringify({ years: sortedYears }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e) {
      logError(requestId, "Error listing combined cache keys", e);
      return new Response(JSON.stringify({ error: (e as Error).message }), {
        status: 500,
        headers: corsHeaders({ "Content-Type": "application/json" }),
      });
    }
  }

  // --- Regular Check/Proxy Logic ---

  // Check if this is an auto-proxy domain
  const isAutoProxyDomain = shouldAutoProxy(normalizedUrl);
  if (isAutoProxyDomain) {
    logInfo(
      requestId,
      `Domain ${new URL(normalizedUrl).hostname} is auto-proxied`
    );
  }

  // For auto-proxy domains in check mode (and NOT an AI cache request), return JSON indicating embedding is not allowed
  if (isAutoProxyDomain && mode === "check") {
    logInfo(
      requestId,
      "Auto-proxy domain in 'check' mode, returning allowed: false"
    );
    return new Response(
      JSON.stringify({
        allowed: false,
        reason: "Auto-proxied domain",
      }),
      {
        headers: corsHeaders({ "Content-Type": "application/json" }),
      }
    );
  }

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
      logInfo(requestId, `Using Wayback Machine URL: ${targetUrl}`);
      isWaybackRequest = true;
      waybackYear = year;
      waybackMonth = month;
      // No need to force proxy mode here, it's already required
    } else {
      logError(requestId, "Invalid year/month format for Wayback request", {
        year,
        month,
      });
      // Potentially return an error or fall back to non-Wayback? Let's return error.
      return new Response(
        JSON.stringify({
          error: "Invalid year/month format for Wayback proxy",
        }),
        { status: 400, headers: corsHeaders({ "Content-Type": "application/json" }) }
      );
    }
  }

  // Check Wayback cache *only* if this is a Wayback request being proxied
  if (isWaybackRequest && waybackYear && waybackMonth) {
    try {
      logInfo(
        requestId,
        `Initializing Wayback cache check for ${normalizedUrl} (${waybackYear}/${waybackMonth})`
      );
      const redis = new Redis({
        url: process.env.REDIS_KV_REST_API_URL as string,
        token: process.env.REDIS_KV_REST_API_TOKEN as string,
      });
      const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
      if (normalizedUrlForKey) {
        const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
          normalizedUrlForKey
        )}:${waybackYear}${waybackMonth}`;
        logInfo(requestId, `Generated Wayback cache key: ${cacheKey}`);
        const cachedContent = (await redis.get(cacheKey)) as string | null;
        if (cachedContent) {
          logInfo(
            requestId,
            `Wayback Cache HIT for ${cacheKey} (content length: ${cachedContent.length})`
          );
          const headers = new Headers();
          headers.set("Content-Type", "text/html; charset=utf-8");
          headers.set("Access-Control-Allow-Origin", "*");
          headers.set("X-Wayback-Cache", "HIT");
          return new Response(cachedContent, { headers });
        }
        logInfo(
          requestId,
          `Wayback Cache MISS for ${cacheKey}, proceeding with Wayback Machine request`
        );
      } else {
        logInfo(
          requestId,
          `URL normalization failed for Wayback cache: ${normalizedUrl}`
        );
      }
    } catch (e) {
      logError(
        requestId,
        `Wayback cache check failed for ${normalizedUrl} (${waybackYear}/${waybackMonth})`,
        e
      );
      // Continue with normal flow if cache check fails
    }
  }

  // Force proxy mode for auto-proxy domains only if NOT a Wayback request already
  if (isAutoProxyDomain && !isWaybackRequest && mode !== "proxy") {
    logInfo(requestId, "Forcing proxy mode for auto-proxied domain");
    mode = "proxy";
  }

  // -------------------------------
  // Helper: perform header‑only check
  // -------------------------------
  const checkSiteEmbeddingAllowed = async () => {
    try {
      logInfo(requestId, `Performing header check for: ${targetUrl}`);
      const res = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        headers: BROWSER_HEADERS, // Add browser headers
      });

      if (!res.ok) {
        throw new Error(`Upstream fetch failed with status ${res.status}`);
      }

      const xFrameOptions = res.headers.get("x-frame-options") || "";
      const headerCsp = res.headers.get("content-security-policy") || "";
      const contentType = res.headers.get("content-type") || "";

      // Check meta tags and extract title only for HTML content
      let metaCsp = "";
      let pageTitle: string | undefined = undefined; // Initialize title

      if (contentType.includes("text/html")) {
        const html = await res.text();
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

      logInfo(
        requestId,
        `Header check result: Allowed=${allowed}, Reason=${
          finalReason || "N/A"
        }, Title=${pageTitle || "N/A"}`
      );

      return { allowed, reason: finalReason, title: pageTitle };
    } catch (error) {
      // If fetching upstream headers failed, assume embedding is blocked
      logError(requestId, `Header check failed for ${targetUrl}`, error);
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
      logInfo(requestId, "Executing in 'check' mode");
      const result = await checkSiteEmbeddingAllowed();
      return new Response(JSON.stringify(result), {
        headers: corsHeaders({ "Content-Type": "application/json" }),
      });
    }

    // 2. Proxy mode – stream the upstream resource, removing blocking headers
    logInfo(requestId, `Executing in 'proxy' mode for: ${targetUrl}`);
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
        logError(
          requestId,
          `Upstream fetch failed with status ${upstreamRes.status}`,
          { url: targetUrl }
        );
        return new Response(
          JSON.stringify({
            error: true,
            status: upstreamRes.status,
            statusText: upstreamRes.statusText || "File not found",
            type: "http_error",
            message: `The page cannot be found. HTTP ${upstreamRes.status} - ${
              upstreamRes.statusText || "File not found"
            }`,
          }),
          {
            status: upstreamRes.status,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // Clone headers so we can edit them
      const headers = new Headers(upstreamRes.headers);
      const contentType = headers.get("content-type") || "";
      logInfo(requestId, `Proxying content type: ${contentType}`);
      let pageTitle: string | undefined = undefined; // Initialize title for proxy mode

      headers.delete("x-frame-options");
      headers.delete("content-security-policy");
      headers.set(
        "content-security-policy",
        "frame-ancestors *; sandbox allow-scripts allow-forms allow-same-origin allow-popups"
      );
      headers.set("access-control-allow-origin", "*");

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

        // Add font override styles
        const fontOverrideStyles = `
<link rel="stylesheet" href="https://os.ryo.lu/fonts/fonts.css">
<style>img{image-rendering:pixelated!important}body,div,span,p,h1,h2,h3,h4,h5,h6,button,input,select,textarea,[style*="font-family"],[style*="sans-serif"],[style*="SF Pro Text"],[style*="-apple-system"],[style*="BlinkMacSystemFont"],[style*="Segoe UI"],[style*="Roboto"],[style*="Oxygen"],[style*="Ubuntu"],[style*="Cantarell"],[style*="Fira Sans"],[style*="Droid Sans"],[style*="Helvetica Neue"],[style*="Helvetica"],[style*="Arial"],[style*="Verdana"],[style*="Geneva"],[style*="Inter"],[style*="Hiragino Sans"],[style*="Hiragino Kaku Gothic"],[style*="Yu Gothic"],[style*="Meiryo"],[style*="MS PGothic"],[style*="MS Gothic"],[style*="Microsoft YaHei"],[style*="PingFang"],[style*="Noto Sans"],[style*="Source Han Sans"],[style*="WenQuanYi"]{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif!important}[style*="serif"],[style*="Georgia"],[style*="Times New Roman"],[style*="Times"],[style*="Palatino"],[style*="Bookman"],[style*="Garamond"],[style*="Cambria"],[style*="Constantia"],[style*="Hiragino Mincho"],[style*="Yu Mincho"],[style*="MS Mincho"],[style*="SimSun"],[style*="NSimSun"],[style*="Source Han Serif"],[style*="Noto Serif CJK"]{font-family:"Mondwest","Yu Mincho","Hiragino Mincho Pro","Songii TC","Georgia","Palatino","SerenityOS-Emoji",serif!important}code,pre,[style*="monospace"],[style*="Courier New"],[style*="Courier"],[style*="Lucida Console"],[style*="Monaco"],[style*="Consolas"],[style*="Inconsolata"],[style*="Source Code Pro"],[style*="Menlo"],[style*="Andale Mono"],[style*="Ubuntu Mono"]{font-family:"Monaco","ArkPixel","SerenityOS-Emoji",monospace!important}*{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif}</style>`;

        const clickInterceptorScript = `
<script>
  document.addEventListener('click', function(event) {
    var targetElement = event.target.closest('a');
    if (targetElement && targetElement.href) {
      event.preventDefault();
      event.stopPropagation();
      try {
        const absoluteUrl = new URL(targetElement.getAttribute('href'), document.baseURI || window.location.href).href;
        window.parent.postMessage({ type: 'iframeNavigation', url: absoluteUrl }, '*');
      } catch (e) { console.error("Error resolving/posting URL:", e); }
    }
  }, true);
</script>
`;
        // Patch history API to avoid cross-origin SecurityError (e.g. Next.js apps inside proxy)
        const historyPatchScript = `
<script>
  (function() {
    const makeRelative = function(url) {
      try {
        if (!url) return url;
        const parsed = new URL(url, document.baseURI);
        if (parsed.origin !== window.location.origin) {
          return parsed.pathname + parsed.search + parsed.hash;
        }
      } catch (e) {}
      return url;
    };
    ['pushState', 'replaceState'].forEach(function(fn) {
      const original = history[fn];
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
  })();
</script>
`;
        const headIndex = html.search(/<head[^>]*>/i);
        if (headIndex !== -1) {
          const insertPos = headIndex + html.match(/<head[^>]*>/i)![0].length;
          html =
            html.slice(0, insertPos) +
            baseTag +
            titleMetaTag +
            fontOverrideStyles +
            historyPatchScript +
            html.slice(insertPos); // Add styles and history patch
        } else {
          // Fallback: Prepend if no <head>
          html =
            baseTag +
            titleMetaTag +
            fontOverrideStyles +
            historyPatchScript +
            html;
        }

        // Inject script right before </body> (case‑insensitive)
        const bodyEndIndex = html.search(/<\/body>/i);
        if (bodyEndIndex !== -1) {
          html =
            html.slice(0, bodyEndIndex) +
            clickInterceptorScript +
            html.slice(bodyEndIndex);
        } else {
          // Fallback: Append script if no </body>
          html += clickInterceptorScript;
        }

        // Add the extracted title to a custom header (URL-encoded)
        if (pageTitle) {
          headers.set("X-Proxied-Page-Title", encodeURIComponent(pageTitle));
        }

        // Cache Wayback content *after* successful fetch and modification
        if (
          isWaybackRequest &&
          waybackYear &&
          waybackMonth &&
          contentType.includes("text/html")
        ) {
          try {
            logInfo(
              requestId,
              `Attempting to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`
            );
            const redis = new Redis({
              url: process.env.REDIS_KV_REST_API_URL as string,
              token: process.env.REDIS_KV_REST_API_TOKEN as string,
            });
            const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
            if (normalizedUrlForKey) {
              const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
                normalizedUrlForKey
              )}:${waybackYear}${waybackMonth}`;
              logInfo(
                requestId,
                `Writing to Wayback cache key: ${cacheKey} (content length: ${html.length})`
              );
              // Use SET with expiration for Wayback cache (e.g., 30 days)
              await redis.set(cacheKey, html, { ex: 60 * 60 * 24 * 30 });
              logInfo(
                requestId,
                `Successfully cached Wayback content for ${cacheKey}`
              );
            } else {
              logInfo(
                requestId,
                `Skipped Wayback caching - URL normalization failed: ${normalizedUrl}`
              );
            }
          } catch (cacheErr) {
            logError(
              requestId,
              `Failed to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`,
              cacheErr
            );
          }
        }

        return new Response(html, {
          status: upstreamRes.status,
          headers,
        });
      } else {
        logInfo(requestId, "Proxying non-HTML content directly");
        // For non‑HTML content, stream the body directly
        // No title extraction or header needed for non-HTML
        return new Response(upstreamRes.body, {
          status: upstreamRes.status,
          headers,
        });
      }
    } catch (fetchError) {
      clearTimeout(timeout);

      // Special handling for timeout or network errors
      logError(requestId, `Proxy fetch error for ${targetUrl}`, fetchError);

      // Return JSON with error information instead of HTML
      return new Response(
        JSON.stringify({
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
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  } catch (error) {
    logError(requestId, "General handler error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders({ "Content-Type": "application/json" }),
    });
  }
}
