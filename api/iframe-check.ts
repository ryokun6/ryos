import * as RateLimit from "./_utils/_rate-limit.js";
import { getClientIp } from "./_utils/_rate-limit.js";
import { apiHandler } from "./_utils/api-handler.js";
import { normalizeUrlForCacheKey } from "./_utils/_url.js";
import { safeFetchWithRedirects, validatePublicUrl, SsrfBlockedError } from "./_utils/_ssrf.js";
import { getAppPublicOrigin } from "./_utils/runtime-config.js";
import { decodeHtmlEntitiesOnce } from "./_utils/html-entities.js";
import { redisKey, redisKeys, sha256RedisIdentifier } from "../src/shared/redisKeys.js";
import {
  isHeadlessRenderConfigured,
  renderUrlToHtml,
} from "./_utils/_headless.js";
import {
  areIeProxySessionsEnabled,
  ensureIeSessionCookie,
  readIeSessionId,
  loadIeCookieHeader,
  saveIeCookies,
} from "./_utils/_ie-session.js";
import {
  isIeLiveBrowserConfigured,
  buildLiveViewUrl,
} from "./_utils/_ie-live.js";
import {
  IeHtmlTooLargeError,
  readResponseTextPrefix,
  readResponseTextWithLimit,
  sanitizeProxiedHtml,
} from "./_utils/_ie-html.js";
import {
  buildIeNavigationInterceptorScript,
  buildIeProxyCsp,
  buildIeProxyErrorDocument,
  classifyProxiedContentType,
  createCspNonce,
  getIeProxyIsolatedOrigin,
  isIeProxyIsolatedRequest,
  sanitizeFrameToken,
  type IeProxyErrorPayload,
} from "./_utils/_ie-proxy.js";
import { isAllowedOrigin } from "./_utils/_cors.js";
import { getHeader } from "./_utils/request-helpers.js";
import { resolveRequestAuth } from "./_utils/request-auth.js";
import type { Redis } from "./_utils/redis.js";
import type { ApiRequest } from "./_utils/api-types.js";

// Request headers that are safe to forward from the embedded page to the
// upstream origin when re-proxying a sub-resource (fetch/XHR). We deliberately
// DO NOT forward Cookie or our own origin's headers, so the proxy never leaks
// ryOS session cookies to third-party sites.
const FORWARDABLE_SUBRESOURCE_HEADERS = [
  "content-type",
  "accept",
  "authorization",
  "x-requested-with",
];

/** Methods whose body must be forwarded to the upstream origin. */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Whether the caller is permitted to opt into the IE Debug proxy features
 * (cookie/session passthrough, forced headless): only the authenticated `ryo`
 * admin, resolved from the first-party auth cookie that same-origin iframe
 * navigations carry. Client-supplied flags never grant access.
 *
 * Env flags (`IE_PROXY_SESSIONS`, headless provider) are checked separately by
 * each caller and make a feature always-on regardless of this gate.
 *
 * Auth is resolved at most once per request (memoized by the caller) and only
 * when a gated feature was actually requested, so the common anonymous browse
 * path adds no extra Redis round-trip.
 */
async function isIeDebugCallerPermitted(
  req: ApiRequest,
  redis: Redis
): Promise<boolean> {
  try {
    const auth = await resolveRequestAuth(req, redis);
    return auth.user?.username === "ryo";
  } catch {
    return false;
  }
}

/**
 * Read the raw request body so it can be forwarded verbatim to the upstream
 * origin. The standalone Bun server may have already parsed JSON / urlencoded
 * bodies into `req.body` (leaving the stream empty), so we reconstruct from
 * the parsed value as a fallback when the stream yields nothing.
 */
async function readForwardBody(
  req: ApiRequest
): Promise<Buffer | string | undefined> {
  const method = (req.method || "GET").toUpperCase();
  if (!BODY_METHODS.has(method)) return undefined;

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    // Stream already consumed or unavailable; fall through to parsed body.
  }
  if (chunks.length > 0) return Buffer.concat(chunks);

  const parsed = (req as unknown as { body?: unknown }).body;
  if (parsed == null) return undefined;
  if (typeof parsed === "string") return parsed;
  if (Buffer.isBuffer(parsed)) return parsed;
  try {
    const contentType = (
      (req.headers["content-type"] as string | undefined) || ""
    ).toLowerCase();
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        if (Array.isArray(value)) {
          for (const v of value) params.append(key, String(v));
        } else {
          params.append(key, String(value));
        }
      }
      return params.toString();
    }
    return JSON.stringify(parsed);
  } catch {
    return undefined;
  }
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
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "medium.com",
  "nytimes.com",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "cnn.com",
  "washingtonpost.com",
  "linkedin.com",
  "instagram.com",
  "facebook.com",
  "amazon.com",
  "youtube.com",
  "twitch.tv",
  "netflix.com",
  "docs.google.com",
  "drive.google.com",
  "mail.google.com",
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

/**
 * Resolve the Wayback Machine snapshot closest to a requested year/month using
 * the public availability API. Previously the proxy always requested
 * `web.archive.org/web/{year}{currentMonth}01/{url}`, which frequently 404s
 * (no capture that exact day) or silently redirects to an unrelated capture.
 * Asking the availability API for the closest capture to the requested
 * timestamp yields a real snapshot far more often.
 *
 * Returns the absolute archive URL (forced to https) and its 14-digit
 * timestamp, or `null` when no snapshot exists / the lookup fails (caller then
 * falls back to the constructed URL).
 */
async function resolveClosestWaybackSnapshot(
  normalizedUrl: string,
  year: string,
  month: string
): Promise<{ snapshotUrl: string; timestamp: string } | null> {
  const targetTimestamp = `${year}${month}01`;
  const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(
    normalizedUrl
  )}&timestamp=${targetTimestamp}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(availabilityUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      archived_snapshots?: {
        closest?: { available?: boolean; url?: string; timestamp?: string };
      };
    };
    const closest = data?.archived_snapshots?.closest;
    if (!closest?.available || !closest.url) return null;
    const snapshotUrl = closest.url.replace(/^http:\/\//i, "https://");
    return {
      snapshotUrl,
      timestamp: closest.timestamp || targetTimestamp,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Stream an undici/web `ReadableStream` response body to the Node-style
 * response without buffering the whole payload in memory. Works with the
 * standalone Bun server's response shim (`write`/`end`) as well as a plain
 * Node `ServerResponse`. Returns true if streaming succeeded.
 */
async function streamBodyToResponse(
  body: ReadableStream<Uint8Array> | null,
  res: { write: (chunk: Buffer) => unknown; end: () => unknown }
): Promise<boolean> {
  if (!body) {
    res.end();
    return true;
  }
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        res.write(Buffer.from(value));
      }
    }
    res.end();
    return true;
  } catch {
    try {
      res.end();
    } catch {
      /* ignore */
    }
    return false;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

async function getIeCacheKey(normalizedUrlForKey: string, year: string): Promise<string> {
  return redisKeys.cache.ieVersions(
    await sha256RedisIdentifier(normalizedUrlForKey),
    year
  );
}

/**
 * Wayback cache entries hold the upstream HTML (not the rewritten document)
 * so every hit goes through the current sanitizer. The `v2` segment retires
 * entries written before that change, which stored rewritten HTML with
 * upstream scripts intact.
 */
async function getWaybackCacheKey(
  normalizedUrlForKey: string,
  yearMonth: string
): Promise<string> {
  return `${redisKeys.cache.wayback(
    await sha256RedisIdentifier(normalizedUrlForKey),
    yearMonth
  )}:v2`;
}

interface WaybackCacheEntry {
  v: 2;
  finalUrl: string;
  html: string;
}

function parseWaybackCacheEntry(value: unknown): WaybackCacheEntry | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as WaybackCacheEntry).v === 2 &&
    typeof (parsed as WaybackCacheEntry).html === "string" &&
    typeof (parsed as WaybackCacheEntry).finalUrl === "string"
  ) {
    return parsed as WaybackCacheEntry;
  }
  return null;
}

/** Pixel-font overrides injected into proxied pages (all themes but macosx). */
const IE_FONT_OVERRIDE_CSS = `img{image-rendering:pixelated!important}body,div,span,p,h1,h2,h3,h4,h5,h6,button,input,select,textarea,[style*="font-family"],[style*="sans-serif"],[style*="SF Pro Text"],[style*="-apple-system"],[style*="BlinkMacSystemFont"],[style*="Segoe UI"],[style*="Roboto"],[style*="Oxygen"],[style*="Ubuntu"],[style*="Cantarell"],[style*="Fira Sans"],[style*="Droid Sans"],[style*="Helvetica Neue"],[style*="Helvetica"],[style*="Arial"],[style*="Verdana"],[style*="Geneva"],[style*="Inter"],[style*="Hiragino Sans"],[style*="Hiragino Kaku Gothic"],[style*="Yu Gothic"],[style*="Meiryo"],[style*="MS PGothic"],[style*="MS Gothic"],[style*="Microsoft YaHei"],[style*="PingFang"],[style*="Noto Sans"],[style*="Source Han Sans"],[style*="WenQuanYi"]{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif!important}[style*="serif"],[style*="Georgia"],[style*="Times New Roman"],[style*="Times"],[style*="Palatino"],[style*="Bookman"],[style*="Garamond"],[style*="Cambria"],[style*="Constantia"],[style*="Hiragino Mincho"],[style*="Yu Mincho"],[style*="MS Mincho"],[style*="SimSun"],[style*="NSimSun"],[style*="Source Han Serif"],[style*="Noto Serif CJK"]{font-family:"Mondwest","Yu Mincho","Hiragino Mincho Pro","Songii TC","Georgia","Palatino","SerenityOS-Emoji",serif!important}code,pre,[style*="monospace"],[style*="Courier New"],[style*="Courier"],[style*="Lucida Console"],[style*="Monaco"],[style*="Consolas"],[style*="Inconsolata"],[style*="Source Code Pro"],[style*="Menlo"],[style*="Andale Mono"],[style*="Ubuntu Mono"]{font-family:"Monaco","ArkPixel","SerenityOS-Emoji",monospace!important}*{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif}`;

const IE_PROXY_CORS_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Username",
  "X-Requested-With",
  "Accept",
];

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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    contentType: null,
    corsHeaders: IE_PROXY_CORS_HEADERS,
    // Sandboxed proxy documents have an opaque origin, so sub-resource
    // requests they make to the isolated proxy host carry `Origin: null`.
    acceptOrigin: (requestOrigin, request) => {
      if (!isIeProxyIsolatedRequest(request)) return false;
      return (
        requestOrigin === "null" ||
        requestOrigin === getIeProxyIsolatedOrigin()
      );
    },
  },
  async ({ req, res, redis, logger, startTime, origin }) => {
  const urlParam = req.query.url as string | undefined;
  let mode = (req.query.mode as string | undefined) || "proxy"; // "check" | "proxy" | "ai" | "list-cache"
  const year = req.query.year as string | undefined;
  const month = req.query.month as string | undefined;
  const effectiveOrigin = origin;
  const httpMethod = (req.method || "GET").toUpperCase();

  // Proxied content never runs with the app origin: every response from this
  // route is sandboxed (opaque origin), non-sniffable and framable only by
  // ryOS. HTML documents tighten script-src further below.
  const onIsolatedProxyHost = isIeProxyIsolatedRequest(req);
  const isolatedProxyOrigin = getIeProxyIsolatedOrigin();
  const frameToken = sanitizeFrameToken(req.query.ieFrame);
  const parentOrigin =
    effectiveOrigin && isAllowedOrigin(effectiveOrigin)
      ? new URL(effectiveOrigin).origin
      : getAppPublicOrigin(null);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin");
  res.setHeader("Content-Security-Policy", buildIeProxyCsp());
  const secFetchDest = (getHeader(req, "sec-fetch-dest") || "").toLowerCase();
  const isFrameNavigation =
    secFetchDest === "iframe" ||
    secFetchDest === "frame" ||
    secFetchDest === "document" ||
    (!!frameToken && secFetchDest === "");

  // `raw=1` marks a re-proxied sub-resource request (fetch/XHR/asset) emitted
  // by the injected interceptor. Raw responses are streamed back untouched
  // (no HTML rewriting / script injection) so JSON, API payloads, scripts and
  // HTML fragments are not corrupted. Any non-GET request is implicitly a
  // sub-resource forward and never a top-level navigation.
  const isRawProxy =
    req.query.raw === "1" || req.query.raw === "true" || httpMethod !== "GET";
  if (isRawProxy) {
    mode = "proxy";
  }
  // `render=headless` forces the (optional, env-gated) headless-browser
  // renderer even when a plain fetch would have succeeded — but only for
  // permitted (admin / debug) callers. Resolved below alongside sessions.
  // Otherwise headless is only used as an automatic fallback when the upstream
  // blocks the proxy (available to everyone).
  const wantsForceHeadless = req.query.render === "headless";
  let forceHeadless = false;

  // Generate a fresh, randomized browser header set for this request
  const BROWSER_HEADERS = generateRandomBrowserHeaders();

  // Diagnostics surfaced via the `X-IE-Proxy` response header so the IE Debug
  // menu / tests can see what the proxy actually did for this request.
  const proxyDebug: {
    cookiesApplied: number;
    headless: boolean;
    upstreamStatus: number | null;
    blocked: boolean;
    scriptsStripped: boolean;
    lite: boolean;
  } = {
    cookiesApplied: 0,
    headless: false,
    upstreamStatus: null,
    blocked: false,
    scriptsStripped: false,
    lite: false,
  };
  const writeProxyDebugHeader = () => {
    try {
      res.setHeader(
        "X-IE-Proxy",
        `cookies=${proxyDebug.cookiesApplied};headless=${
          proxyDebug.headless ? 1 : 0
        };status=${proxyDebug.upstreamStatus ?? "-"};blocked=${
          proxyDebug.blocked ? 1 : 0
        };scriptsStripped=${proxyDebug.scriptsStripped ? 1 : 0};lite=${
          proxyDebug.lite ? 1 : 0
        }`
      );
      res.setHeader("Access-Control-Expose-Headers", "X-IE-Proxy");
    } catch {
      /* headers already sent */
    }
  };

  // Helper for consistent error responses (CORS headers come from apiHandler)
  const errorResponseWithCors = (message: string, status: number = 400) => {
    res.setHeader("Content-Type", "application/json");
    logger.response(status, Date.now() - startTime);
    return res.status(status).json({ error: message });
  };

  // Proxy errors. Iframe navigations get a tiny HTML page that reports the
  // error to the parent over postMessage (the parent cannot read the
  // sandboxed document); fetch callers keep the JSON body.
  const sendProxyError = (status: number, payload: IeProxyErrorPayload) => {
    logger.response(status, Date.now() - startTime);
    if (isFrameNavigation && !isRawProxy) {
      const nonce = createCspNonce();
      res.setHeader("Content-Security-Policy", buildIeProxyCsp({ scriptNonce: nonce }));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(status).send(
        buildIeProxyErrorDocument(payload, { nonce, frameToken, parentOrigin })
      );
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(status).json(payload);
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

  try {
    await validatePublicUrl(normalizedUrl);
  } catch (error) {
    const message =
      error instanceof SsrfBlockedError ? error.message : "Invalid URL format";
    logger.warn("Blocked URL for iframe check", { normalizedUrl, message, mode });
    if (mode === "proxy" && isFrameNavigation) {
      return sendProxyError(400, {
        error: true,
        type: error instanceof SsrfBlockedError ? "ssrf_blocked" : "connection_error",
        status: 400,
        message:
          error instanceof SsrfBlockedError
            ? message
            : "The page cannot be displayed. Internet Explorer cannot access this website.",
        details: message,
      });
    }
    return errorResponseWithCors(message, 400);
  }

  // With a dedicated proxy origin configured, documents are only ever served
  // from that host; the app origin just bounces the navigation there.
  if (
    isolatedProxyOrigin &&
    !onIsolatedProxyHost &&
    mode === "proxy" &&
    httpMethod === "GET"
  ) {
    const location = `${isolatedProxyOrigin}${req.url || ""}`;
    res.setHeader("Location", location);
    res.setHeader("Cache-Control", "no-store");
    logger.response(302, Date.now() - startTime);
    return res.status(302).end();
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
        res.setHeader("X-AI-Cache", "HIT");
        logger.response(200, Date.now() - startTime);
        return res.status(200).send(html);
      }
      logger.info(`AI Cache MISS for key: ${key}`);
      res.setHeader("Content-Type", "application/json");
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

  /**
   * Rewrite an upstream HTML document for display inside the IE iframe and
   * send it. On the app origin all upstream scripts, handlers and
   * `javascript:` URLs are removed and only the nonce'd interceptor may run;
   * on the isolated proxy host upstream scripts are kept.
   */
  const sendProxiedHtml = async (
    rawHtml: string,
    pageFinalUrl: string,
    status: number
  ) => {
    const sanitized = await sanitizeProxiedHtml(rawHtml, {
      pageUrl: pageFinalUrl,
      keepScripts: onIsolatedProxyHost,
    });
    let html = sanitized.html;
    if (sanitized.strippedScripts) {
      proxyDebug.scriptsStripped = true;
    }
    if (sanitized.liteMode) {
      logger.info(
        `Serving lite view for oversized HTML (${sanitized.byteLength} bytes) at ${pageFinalUrl}`
      );
      proxyDebug.lite = true;
    }
    writeProxyDebugHeader();

    // Strip existing <base> tags to prevent conflicts with our injected base tag
    html = html.replace(/<base\s[^>]*>/gi, "");
    // Strip meta CSP / X-Frame-Options / refresh tags (also removed by the
    // parser-based sanitizer when scripts are stripped)
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, "");
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, "");
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
    html = html.replace(/<meta[^>]*content\s*=\s*["'][^"']*["'][^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, "");

    let pageTitle: string | undefined;
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      pageTitle = decodeHtmlEntitiesOnce(titleMatch[1]).trim();
    }

    const baseTag = `<base href="${pageFinalUrl.replace(/"/g, "%22")}">`;
    const titleMetaTag = pageTitle
      ? `<meta name="page-title" content="${encodeURIComponent(pageTitle)}">`
      : "";

    const appPublicOrigin = getAppPublicOrigin(parentOrigin);
    const fontOverrideStyles = shouldInjectFontOverrides
      ? `
<link rel="stylesheet" href="${appPublicOrigin}/fonts/fonts.css">
<style>${IE_FONT_OVERRIDE_CSS}</style>`
      : "";

    const nonce = onIsolatedProxyHost ? null : createCspNonce();
    const navigationInterceptorScript = buildIeNavigationInterceptorScript({
      nonce,
      frameToken,
      parentOrigin,
    });

    const headMatch = html.match(/<head[^>]*>/i);
    const injected = baseTag + titleMetaTag + navigationInterceptorScript + fontOverrideStyles;
    if (headMatch && headMatch.index !== undefined) {
      const insertPos = headMatch.index + headMatch[0].length;
      html = html.slice(0, insertPos) + injected + html.slice(insertPos);
    } else {
      html = "<head>" + injected + "</head>" + html;
    }

    if (pageTitle) {
      res.setHeader("X-Proxied-Page-Title", encodeURIComponent(pageTitle));
    }
    res.setHeader("Content-Security-Policy", buildIeProxyCsp({ scriptNonce: nonce }));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    logger.response(status, Date.now() - startTime);
    return res.status(status).send(html);
  };

  // Determine target URL (Wayback or original)
  let targetUrl = normalizedUrl;
  let isWaybackRequest = false;
  let waybackYear: string | null = null;
  let waybackMonth: string | null = null;

  // If year and month are provided (likely from a YYYYMM entry click), construct Wayback URL
  if (year && month && mode === "proxy") {
    // Only construct Wayback URL if proxying with year/month
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month)) {
      // Fallback target; replaced with the closest real capture below (after
      // the cache miss is confirmed, to avoid an availability lookup on hits).
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
        const cachedEntry = parseWaybackCacheEntry(await redis.get(cacheKey));
        if (cachedEntry) {
          logger.info(`Wayback Cache HIT for ${cacheKey} (content length: ${cachedEntry.html.length})`);
          res.setHeader("X-Wayback-Cache", "HIT");
          return await sendProxiedHtml(cachedEntry.html, cachedEntry.finalUrl, 200);
        }
        logger.info(`Wayback Cache MISS for ${cacheKey}, proceeding with Wayback Machine request`);
      } else {
        logger.info(`URL normalization failed for Wayback cache: ${normalizedUrl}`);
      }
    } catch (e) {
      logger.error(`Wayback cache check failed for ${normalizedUrl} (${waybackYear}/${waybackMonth})`, e);
      // Continue with normal flow if cache check fails
    }

    // Cache missed: resolve the closest real capture to the requested
    // year/month instead of guessing `{year}{month}01`, which often 404s.
    try {
      const resolved = await resolveClosestWaybackSnapshot(
        normalizedUrl,
        waybackYear,
        waybackMonth
      );
      if (resolved) {
        targetUrl = resolved.snapshotUrl;
        logger.info(
          `Resolved closest Wayback snapshot (${resolved.timestamp}): ${targetUrl}`
        );
      } else {
        logger.info(
          `No Wayback availability result; using constructed URL: ${targetUrl}`
        );
      }
    } catch (resolveErr) {
      logger.warn("Wayback snapshot resolution failed", resolveErr);
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
          headers: BROWSER_HEADERS,
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
        // Only scan a prefix — full buffering of multi‑MB pages stalls the
        // API and is unnecessary for title / meta CSP extraction.
        const html = await readResponseTextPrefix(fetchRes);
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
      } else {
        try {
          fetchRes.body?.cancel();
        } catch {
          /* ignore */
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
    // 0. Live browser mode — return the embeddable live-view URL (or 501 when
    // the capability isn't configured). Feature-flagged; off by default.
    if (mode === "live") {
      logger.info("Executing in 'live' mode");
      res.setHeader("Content-Type", "application/json");
      if (!isIeLiveBrowserConfigured()) {
        logger.response(501, Date.now() - startTime);
        return res.status(501).json({
          error: true,
          type: "live_not_configured",
          message: "Live browser mode is not enabled on this server.",
        });
      }
      const liveViewUrl = buildLiveViewUrl(normalizedUrl);
      logger.response(200, Date.now() - startTime);
      return res.status(200).json({ liveViewUrl });
    }

    // 1. Pure header‑check mode
    if (mode === "check") {
      logger.info("Executing in 'check' mode");

      // Per-host embeddability cache: the allowed/blocked verdict for a host is
      // stable over short windows, so cache it to avoid re-fetching upstream on
      // every navigation. Title is included opportunistically as a prefetch
      // hint (it may go stale, which is harmless).
      let embedCacheKey: string | null = null;
      try {
        const host = new URL(normalizedUrl).hostname.toLowerCase();
        embedCacheKey = redisKey(
          "cache",
          "ie",
          "embed",
          await sha256RedisIdentifier(host)
        );
        // The Redis client may auto-deserialize JSON (Upstash REST) or return
        // the raw string (standard Redis), so handle both shapes.
        const cached = await redis.get(embedCacheKey);
        if (cached) {
          const parsed =
            typeof cached === "string" ? JSON.parse(cached) : cached;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("X-Embed-Cache", "HIT");
          logger.response(200, Date.now() - startTime);
          return res.status(200).json(parsed);
        }
      } catch (cacheErr) {
        logger.warn("Embed cache read failed", cacheErr);
      }

      const result = await checkSiteEmbeddingAllowed();
      if (embedCacheKey) {
        try {
          // Cache for 6h. Successful verdicts last longer than failures, which
          // are often transient (timeouts / rate limits). Store the object
          // directly; the client serializes it.
          await redis.set(embedCacheKey, result, {
            ex: result.reason?.startsWith("Proxy check failed")
              ? 60 * 5
              : 60 * 60 * 6,
          });
        } catch (cacheErr) {
          logger.warn("Embed cache write failed", cacheErr);
        }
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Embed-Cache", "MISS");
      logger.response(200, Date.now() - startTime);
      return res.status(200).json(result);
    }

    // 2. Proxy mode – stream the upstream resource, removing blocking headers
    logger.info(`Executing in 'proxy' mode for: ${targetUrl}`);
    // Create an AbortController with timeout for the upstream fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30-second timeout

    // Add Referer header for the target site (some sites require valid referer)
    try {
      BROWSER_HEADERS['Referer'] = new URL(targetUrl).origin + '/';
    } catch { /* ignore URL parse errors */ }

    // For re-proxied sub-resources, forward a safe subset of the original
    // request headers (content-type / accept / authorization) so APIs that
    // depend on them keep working — but never the embedded page's cookies.
    if (isRawProxy) {
      for (const headerName of FORWARDABLE_SUBRESOURCE_HEADERS) {
        const value = req.headers[headerName];
        if (typeof value === "string" && value) {
          BROWSER_HEADERS[
            headerName.replace(/(^|-)([a-z])/g, (_m, p1, p2) =>
              p1 + p2.toUpperCase()
            )
          ] = value;
        }
      }
    }

    // Forward the original method + body for non-GET sub-resource requests
    // (form POSTs, JSON API calls, etc.). Read as a Buffer so it survives any
    // 307/308 redirects that preserve the method.
    const forwardBody = await readForwardBody(req);

    // Resolve the admin/debug permission at most once, and only when a gated
    // feature (sessions / forced headless) was actually requested — keeping the
    // common anonymous browse path free of extra auth round-trips.
    const isTopLevelGet = !isRawProxy && httpMethod === "GET";
    const wantsSessions =
      req.query.ieSessions === "1" || req.query.ieSessions === "true";
    let gatePermittedCache: boolean | null = null;
    const isDebugCallerPermitted = async (): Promise<boolean> => {
      if (gatePermittedCache === null) {
        gatePermittedCache = await isIeDebugCallerPermitted(req, redis);
      }
      return gatePermittedCache;
    };

    // Optional cookie/session passthrough. Always-on when `IE_PROXY_SESSIONS`
    // is set; otherwise opt-in via the IE Debug menu (`ieSessions=1`) for
    // permitted (admin / debug) callers. On a permitted top-level navigation we
    // mint the first-party `ie_psid` cookie ("arm" the session); thereafter
    // every request — including sub-resource fetch/XHR that already carry the
    // same-origin cookie — replays and persists the per-host jar.
    const existingPsid = readIeSessionId(req);
    let ieSessionId: string | null = existingPsid;
    if (isTopLevelGet) {
      const sessionsPermitted =
        areIeProxySessionsEnabled() ||
        (wantsSessions && (await isDebugCallerPermitted()));
      if (sessionsPermitted) {
        ieSessionId = ensureIeSessionCookie(req, res);
      }
    }
    if (ieSessionId) {
      const cookieHeader = await loadIeCookieHeader(redis, ieSessionId, targetUrl);
      if (cookieHeader) {
        BROWSER_HEADERS["Cookie"] = cookieHeader;
        proxyDebug.cookiesApplied = cookieHeader.split(";").length;
      }
    }

    // Forced headless is a permitted-caller-only affordance (auto-fallback on
    // block still works for everyone below).
    forceHeadless =
      wantsForceHeadless && isTopLevelGet && (await isDebugCallerPermitted());

    // Top-level navigations may fall back to (or force) headless rendering.
    const headlessEligible =
      !isRawProxy && httpMethod === "GET" && isHeadlessRenderConfigured();

    try {
      const fetchResult = await safeFetchWithRedirects(
        targetUrl,
        {
          method: httpMethod,
          signal: controller.signal,
          headers: BROWSER_HEADERS,
          ...(forwardBody !== undefined ? { body: forwardBody } : {}),
        },
        { maxRedirects: 10 }
      );
      let upstreamRes = fetchResult.response;
      let finalUrl = fetchResult.finalUrl;
      const setCookies = fetchResult.setCookies;
      proxyDebug.upstreamStatus = upstreamRes.status;

      clearTimeout(timeout); // Clear timeout on successful fetch

      // Persist any cookies the upstream set (login flows set them on the
      // intermediate redirects, which safeFetchWithRedirects also collects).
      if (ieSessionId && setCookies.length) {
        await saveIeCookies(redis, ieSessionId, finalUrl || targetUrl, setCookies);
      }

      // Headless fallback: when the upstream blocked the proxy (or the caller
      // forced `render=headless`), render the page with a real browser engine
      // and feed the resulting HTML through the normal rewrite pipeline below.
      const upstreamBlocked =
        !upstreamRes.ok &&
        [401, 403, 405, 406, 429, 451].includes(upstreamRes.status);
      if (headlessEligible && (forceHeadless || upstreamBlocked)) {
        logger.info(
          `Attempting headless render fallback for ${targetUrl} (status ${upstreamRes.status}, forced=${forceHeadless})`
        );
        const rendered = await renderUrlToHtml(finalUrl || targetUrl, {
          logger,
        });
        if (rendered) {
          proxyDebug.headless = true;
          logger.info(
            `Headless render succeeded via ${rendered.provider}; serving rendered HTML`
          );
          try {
            upstreamRes.body?.cancel();
          } catch {
            /* ignore */
          }
          upstreamRes = new Response(rendered.html, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
          finalUrl = rendered.finalUrl || finalUrl;
        }
      }

      // If the upstream fetch failed (e.g., 403 Forbidden, 404 Not Found), return an error response
      if (!upstreamRes.ok) {
        logger.error(`Upstream fetch failed with status ${upstreamRes.status}`, { url: targetUrl });
        // Distinguish "site actively blocked us" (auth / bot protection /
        // legal block) from a plain not-found so the UI can give a clearer
        // explanation. These statuses commonly come from Cloudflare/Akamai
        // anti-bot challenges that reject the proxy's datacenter IP.
        const isAccessBlocked = [401, 403, 405, 406, 429, 451].includes(
          upstreamRes.status
        );
        proxyDebug.blocked = isAccessBlocked;
        writeProxyDebugHeader();
        try {
          upstreamRes.body?.cancel();
        } catch {
          /* ignore */
        }
        const blockedMessage = `This website blocked the request (HTTP ${
          upstreamRes.status
        } - ${
          upstreamRes.statusText || "Forbidden"
        }). It may protect against automated access or require signing in.`;
        const notFoundMessage = `The page cannot be found. HTTP ${
          upstreamRes.status
        } - ${upstreamRes.statusText || "File not found"}`;
        return sendProxyError(upstreamRes.status, {
          error: true,
          status: upstreamRes.status,
          statusText: upstreamRes.statusText || "File not found",
          type: isAccessBlocked ? "access_blocked" : "http_error",
          message: isAccessBlocked ? blockedMessage : notFoundMessage,
        });
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      logger.info(`Proxying content type: ${contentType}`);

      // Raw / non-HTML bodies are streamed. On the app origin, script-capable
      // upstream types are never reflected (text/plain or a forced download
      // instead); the isolated proxy host may reflect them because nothing
      // there carries a session and every response is CSP-sandboxed.
      const streamPassthrough = async (label: string) => {
        writeProxyDebugHeader();
        if (onIsolatedProxyHost) {
          if (contentType) res.setHeader("Content-Type", contentType);
        } else {
          const decision = classifyProxiedContentType(contentType);
          res.setHeader("Content-Type", decision.contentType);
          if (decision.contentDisposition) {
            res.setHeader("Content-Disposition", decision.contentDisposition);
          }
        }
        const cacheControl = upstreamRes.headers.get("cache-control");
        if (cacheControl) res.setHeader("Cache-Control", cacheControl);
        res.status(upstreamRes.status);
        const streamed = await streamBodyToResponse(
          upstreamRes.body as ReadableStream<Uint8Array> | null,
          res
        );
        if (!streamed) {
          logger.warn(`${label} proxy stream interrupted for ${targetUrl}`);
        }
        logger.response(upstreamRes.status, Date.now() - startTime);
      };

      // Raw sub-resource forward: no HTML rewriting / interceptor injection so
      // JSON and other payloads fetched via the re-proxied fetch/XHR are not
      // corrupted.
      if (isRawProxy) {
        await streamPassthrough("Raw");
        return;
      }

      if (contentType.includes("text/html")) {
        let html: string;
        try {
          html = await readResponseTextWithLimit(upstreamRes);
        } catch (sizeError) {
          if (sizeError instanceof IeHtmlTooLargeError) {
            logger.warn(
              `Refusing oversized HTML for ${targetUrl} (${sizeError.byteLength} bytes)`
            );
            proxyDebug.blocked = true;
            writeProxyDebugHeader();
            return sendProxyError(413, {
              error: true,
              type: "page_too_large",
              status: 413,
              message:
                "This page is too large to display safely. Internet Explorer stopped loading it to keep ryOS responsive.",
              details: sizeError.message,
            });
          }
          throw sizeError;
        }

        const pageFinalUrl = finalUrl || targetUrl;

        // Cache the upstream HTML (not the rewritten document) so cache hits
        // are sanitized with the current rules.
        if (isWaybackRequest && waybackYear && waybackMonth) {
          try {
            const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
            if (normalizedUrlForKey) {
              const cacheKey = await getWaybackCacheKey(
                normalizedUrlForKey,
                `${waybackYear}${waybackMonth}`
              );
              const entry: WaybackCacheEntry = { v: 2, finalUrl: pageFinalUrl, html };
              await redis.set(cacheKey, JSON.stringify(entry), {
                ex: 60 * 60 * 24 * 30,
              });
              logger.info(`Cached Wayback content for ${cacheKey}`);
            }
          } catch (cacheErr) {
            logger.error(
              `Failed to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`,
              cacheErr
            );
          }
        }

        return await sendProxiedHtml(html, pageFinalUrl, upstreamRes.status);
      }

      logger.info("Proxying non-HTML content directly (streamed)");
      await streamPassthrough("Non-HTML");
      return;
    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError instanceof SsrfBlockedError) {
        logger.warn(`Proxy blocked SSRF target for ${targetUrl}`, fetchError);
        return sendProxyError(400, {
          error: true,
          type: "ssrf_blocked",
          status: 400,
          message: fetchError.message,
        });
      }

      // Special handling for timeout or network errors
      logger.error(`Proxy fetch error for ${targetUrl}`, fetchError);

      return sendProxyError(503, {
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
