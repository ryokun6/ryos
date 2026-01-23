/**
 * /api/iframe-check
 * 
 * Node.js function that checks if a remote website allows itself to be embedded in an iframe.
 * Also supports proxy mode, AI cache mode, and list-cache mode.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  getClientIpNode,
} from "./_utils/middleware.js";
import * as RateLimit from "./_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 60;

import { normalizeUrlForCacheKey } from "./_utils/_url.js";

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

// --- Utility Functions ----------------------------------------------------

const AUTO_PROXY_DOMAINS = [
  "wikipedia.org",
  "wikimedia.org",
  "wikipedia.com",
  "cursor.com",
];

const shouldAutoProxy = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return AUTO_PROXY_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};

// ------------------------------------------------------------------------
// Dynamic browser header generation
// ------------------------------------------------------------------------
const USER_AGENT_SAMPLES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"',
    platform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
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

const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const urlParam = req.query.url as string | undefined;
  let mode = (req.query.mode as string) || "proxy";
  const year = req.query.year as string | undefined;
  const month = req.query.month as string | undefined;
  const requestId = generateRequestId();
  const effectiveOrigin = getEffectiveOriginNode(req);

  if (!isAllowedOrigin(effectiveOrigin)) {
    return res.status(403).send("Unauthorized");
  }

  const BROWSER_HEADERS = generateRandomBrowserHeaders();
  logRequest(req.method || "GET", req.url || "", mode, requestId);

  // Helper for consistent error responses with CORS
  const errorResponseWithCors = (message: string, status: number = 400) => {
    setCorsHeadersNode(res, effectiveOrigin);
    return res.status(status).json({ error: message });
  };

  if (!urlParam) {
    logError(requestId, "Missing 'url' query parameter", null);
    return errorResponseWithCors("Missing 'url' query parameter");
  }

  const normalizedUrl = urlParam.startsWith("http")
    ? urlParam
    : `https://${urlParam}`;

  logInfo(requestId, `Normalized URL: ${normalizedUrl}`);

  // ---------------------------
  // Rate limiting (mode-specific)
  // ---------------------------
  try {
    const ip = getClientIpNode(req);
    const BURST_WINDOW = 60;
    const burstKeyBase = ["rl", "iframe", mode, "ip", ip];

    if (mode === "proxy" || mode === "check") {
      const globalKey = RateLimit.makeKey(burstKeyBase);
      const global = await RateLimit.checkCounterLimit({
        key: globalKey,
        windowSeconds: BURST_WINDOW,
        limit: 300,
      });
      if (!global.allowed) {
        setCorsHeadersNode(res, effectiveOrigin);
        res.setHeader("Retry-After", String(global.resetSeconds ?? BURST_WINDOW));
        return res.status(429).json({
          error: "rate_limit_exceeded",
          scope: "global",
          mode,
        });
      }

      try {
        const hostname = new URL(
          urlParam.startsWith("http") ? urlParam : `https://${urlParam}`
        ).hostname.toLowerCase();
        const hostKey = RateLimit.makeKey([
          "rl", "iframe", mode, "ip", ip, "host", hostname,
        ]);
        const host = await RateLimit.checkCounterLimit({
          key: hostKey,
          windowSeconds: BURST_WINDOW,
          limit: 100,
        });
        if (!host.allowed) {
          setCorsHeadersNode(res, effectiveOrigin);
          res.setHeader("Retry-After", String(host.resetSeconds ?? BURST_WINDOW));
          return res.status(429).json({
            error: "rate_limit_exceeded",
            scope: "host",
            host: hostname,
            mode,
          });
        }
      } catch (e) {
        void e;
      }
    } else if (mode === "ai" || mode === "list-cache") {
      const key = RateLimit.makeKey(burstKeyBase);
      const result = await RateLimit.checkCounterLimit({
        key,
        windowSeconds: BURST_WINDOW,
        limit: 120,
      });
      if (!result.allowed) {
        setCorsHeadersNode(res, effectiveOrigin);
        res.setHeader("Retry-After", String(result.resetSeconds ?? BURST_WINDOW));
        return res.status(429).json({ error: "rate_limit_exceeded", scope: mode });
      }
    }
  } catch (e) {
    logError(requestId, "Rate limit check failed (iframe-check)", e);
  }

  // --- AI cache retrieval mode ---
  if (mode === "ai") {
    const aiUrl = normalizedUrl;
    if (!year) {
      logError(requestId, "Missing year for AI cache mode", { year });
      return errorResponseWithCors("Missing year parameter");
    }

    const isValidYear =
      /^\d{1,4}( BC)?$/.test(year) ||
      /^\d+ CE$/.test(year) ||
      year === "current";

    if (!isValidYear) {
      logError(requestId, "Invalid year format for AI cache mode", { year });
      return errorResponseWithCors("Invalid year format");
    }

    const normalizedUrlForKey = normalizeUrlForCacheKey(aiUrl);
    logInfo(requestId, `Normalized URL for AI cache key: ${normalizedUrlForKey}`);

    if (!normalizedUrlForKey) {
      logError(requestId, "URL normalization failed for AI cache key", null);
      return errorResponseWithCors("URL normalization failed", 500);
    }

    try {
      const redis = createRedis();
      const key = `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:${year}`;
      logInfo(requestId, `Checking AI cache with key: ${key}`);
      const html = (await redis.lindex(key, 0)) as string | null;
      if (html) {
        logInfo(requestId, `AI Cache HIT for key: ${key}`);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("X-AI-Cache", "HIT");
        return res.status(200).send(html);
      }
      logInfo(requestId, `AI Cache MISS for key: ${key}`);
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(404).json({ aiCache: false });
    } catch (e) {
      logError(requestId, "Error checking AI cache", e);
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  // --- List Cache mode ---
  if (mode === "list-cache") {
    const listUrl = normalizedUrl;
    logInfo(requestId, `Executing in 'list-cache' mode for: ${listUrl}`);

    const normalizedUrlForKey = normalizeUrlForCacheKey(listUrl);
    logInfo(requestId, `Normalized URL for list-cache key: ${normalizedUrlForKey}`);
    if (!normalizedUrlForKey) {
      logError(requestId, "URL normalization failed for list-cache key", null);
      return errorResponseWithCors("URL normalization failed", 500);
    }

    try {
      const redis = createRedis();
      const uniqueYears = new Set<string>();

      const aiPattern = `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:*`;
      const aiKeyPrefixLength = `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:`.length;
      logInfo(requestId, `Scanning Redis for AI cache with pattern: ${aiPattern}`);
      let aiCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(aiCursor, { match: aiPattern, count: 100 });
        aiCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearPart = key.substring(aiKeyPrefixLength);
          if (yearPart && /^(\d{1,4}( BC)?|\d+ CE)$/.test(yearPart)) {
            uniqueYears.add(yearPart);
          } else {
            logInfo(requestId, `Skipping invalid AI year format in key: ${key}`);
          }
        }
      } while (aiCursor !== 0);

      const waybackPattern = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:*`;
      const waybackKeyPrefixLength = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:`.length;
      logInfo(requestId, `Scanning Redis for Wayback cache with pattern: ${waybackPattern}`);
      let waybackCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(waybackCursor, { match: waybackPattern, count: 100 });
        waybackCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearMonthPart = key.substring(waybackKeyPrefixLength);
          if (yearMonthPart && /^\d{6}$/.test(yearMonthPart)) {
            const yearVal = yearMonthPart.substring(0, 4);
            uniqueYears.add(yearVal);
          } else {
            logInfo(requestId, `Skipping invalid Wayback year-month format in key: ${key}`);
          }
        }
      } while (waybackCursor !== 0);

      const sortedYears = Array.from(uniqueYears);
      sortedYears.sort((a, b) => {
        if (a === "current") return -1;
        if (b === "current") return 1;
        const valA = parseInt(a.replace(" BC", ""), 10);
        const valB = parseInt(b.replace(" BC", ""), 10);
        const isABC = a.includes(" BC");
        const isBBC = b.includes(" BC");
        if (isABC && !isBBC) return 1;
        if (!isABC && isBBC) return -1;
        if (isABC && isBBC) return valA - valB;
        return valB - valA;
      });

      logInfo(requestId, `Found ${sortedYears.length} unique cached years for URL: ${listUrl}`);
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).json({ years: sortedYears });
    } catch (e) {
      logError(requestId, "Error listing combined cache keys", e);
      return res.status(500).json({ error: (e as Error).message });
    }
  }

  // --- Regular Check/Proxy Logic ---
  const isAutoProxyDomain = shouldAutoProxy(normalizedUrl);
  if (isAutoProxyDomain) {
    logInfo(requestId, `Domain ${new URL(normalizedUrl).hostname} is auto-proxied`);
  }

  if (isAutoProxyDomain && mode === "check") {
    logInfo(requestId, "Auto-proxy domain in 'check' mode, returning allowed: false");
    return res.status(200).json({ allowed: false, reason: "Auto-proxied domain" });
  }

  const theme = ((req.query.theme as string) || "").toLowerCase();
  const shouldInjectFontOverrides = theme !== "macosx";

  let targetUrl = normalizedUrl;
  let isWaybackRequest = false;
  let waybackYear: string | null = null;
  let waybackMonth: string | null = null;

  if (year && month && mode === "proxy") {
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month)) {
      targetUrl = `https://web.archive.org/web/${year}${month}01/${normalizedUrl}`;
      logInfo(requestId, `Using Wayback Machine URL: ${targetUrl}`);
      isWaybackRequest = true;
      waybackYear = year;
      waybackMonth = month;
    } else {
      logError(requestId, "Invalid year/month format for Wayback request", { year, month });
      return errorResponseWithCors("Invalid year/month format for Wayback proxy");
    }
  }

  // Check Wayback cache
  if (isWaybackRequest && waybackYear && waybackMonth) {
    try {
      logInfo(requestId, `Initializing Wayback cache check for ${normalizedUrl} (${waybackYear}/${waybackMonth})`);
      const redis = createRedis();
      const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
      if (normalizedUrlForKey) {
        const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:${waybackYear}${waybackMonth}`;
        logInfo(requestId, `Generated Wayback cache key: ${cacheKey}`);
        const cachedContent = (await redis.get(cacheKey)) as string | null;
        if (cachedContent) {
          logInfo(requestId, `Wayback Cache HIT for ${cacheKey} (content length: ${cachedContent.length})`);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("X-Wayback-Cache", "HIT");
          return res.status(200).send(cachedContent);
        }
        logInfo(requestId, `Wayback Cache MISS for ${cacheKey}, proceeding with Wayback Machine request`);
      } else {
        logInfo(requestId, `URL normalization failed for Wayback cache: ${normalizedUrl}`);
      }
    } catch (e) {
      logError(requestId, `Wayback cache check failed for ${normalizedUrl} (${waybackYear}/${waybackMonth})`, e);
    }
  }

  if (isAutoProxyDomain && !isWaybackRequest && mode !== "proxy") {
    logInfo(requestId, "Forcing proxy mode for auto-proxied domain");
    mode = "proxy";
  }

  // Helper: perform header-only check
  const checkSiteEmbeddingAllowed = async () => {
    try {
      logInfo(requestId, `Performing header check for: ${targetUrl}`);
      const fetchRes = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        headers: BROWSER_HEADERS,
      });

      if (!fetchRes.ok) {
        throw new Error(`Upstream fetch failed with status ${fetchRes.status}`);
      }

      const xFrameOptions = fetchRes.headers.get("x-frame-options") || "";
      const headerCsp = fetchRes.headers.get("content-security-policy") || "";
      const contentType = fetchRes.headers.get("content-type") || "";

      let metaCsp = "";
      let pageTitle: string | undefined = undefined;

      if (contentType.includes("text/html")) {
        const html = await fetchRes.text();
        const metaTagMatch = html.match(
          /<meta\s+http-equiv=["']Content-Security-Policy["']\s+content=["']([^"']*)["'][^>]*>/i
        );
        if (metaTagMatch && metaTagMatch[1]) {
          metaCsp = metaTagMatch[1];
        }
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
            console.error("Error decoding title:", e);
            pageTitle = titleMatch[1].trim();
          }
        }
      }

      const checkFrameAncestors = (cspString: string): boolean => {
        if (!cspString) return false;
        const directiveMatch = cspString
          .toLowerCase()
          .split(";")
          .map((d) => d.trim())
          .find((d) => d.startsWith("frame-ancestors"));
        if (!directiveMatch) return false;
        const directiveValue = directiveMatch.replace("frame-ancestors", "").trim();
        if (directiveValue === "'none'") return true;
        return !directiveValue.includes("*");
      };

      const isBlockedByCsp = checkFrameAncestors(headerCsp) || checkFrameAncestors(metaCsp);
      const isBlockedByXfo = (() => {
        if (!xFrameOptions) return false;
        const value = xFrameOptions.toLowerCase();
        return value.includes("deny") || value.includes("sameorigin");
      })();

      const allowed = !(isBlockedByXfo || isBlockedByCsp);
      const finalReason = !allowed
        ? isBlockedByXfo
          ? `X-Frame-Options: ${xFrameOptions}`
          : metaCsp && checkFrameAncestors(metaCsp)
          ? `Content-Security-Policy (meta): ${metaCsp}`
          : `Content-Security-Policy (header): ${headerCsp}`
        : undefined;

      logInfo(requestId, `Header check result: Allowed=${allowed}, Reason=${finalReason || "N/A"}, Title=${pageTitle || "N/A"}`);
      return { allowed, reason: finalReason, title: pageTitle };
    } catch (error) {
      logError(requestId, `Header check failed for ${targetUrl}`, error);
      return { allowed: false, reason: `Proxy check failed: ${(error as Error).message}` };
    }
  };

  try {
    // 1. Pure header-check mode
    if (mode === "check") {
      logInfo(requestId, "Executing in 'check' mode");
      const result = await checkSiteEmbeddingAllowed();
      return res.status(200).json(result);
    }

    // 2. Proxy mode
    logInfo(requestId, `Executing in 'proxy' mode for: ${targetUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: BROWSER_HEADERS,
      });

      clearTimeout(timeout);

      if (!upstreamRes.ok) {
        logError(requestId, `Upstream fetch failed with status ${upstreamRes.status}`, { url: targetUrl });
        res.setHeader("Access-Control-Allow-Origin", "*");
        return res.status(upstreamRes.status).json({
          error: true,
          status: upstreamRes.status,
          statusText: upstreamRes.statusText || "File not found",
          type: "http_error",
          message: `The page cannot be found. HTTP ${upstreamRes.status} - ${upstreamRes.statusText || "File not found"}`,
        });
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      logInfo(requestId, `Proxying content type: ${contentType}`);
      let pageTitle: string | undefined = undefined;

      // Set response headers
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("content-security-policy", "frame-ancestors *; sandbox allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock");

      if (contentType.includes("text/html")) {
        let html = await upstreamRes.text();

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
            pageTitle = titleMatch[1].trim();
          }
        }

        const baseTag = `<base href="${targetUrl}">`;
        const titleMetaTag = pageTitle ? `<meta name="page-title" content="${encodeURIComponent(pageTitle)}">` : "";

        const fontOverrideStyles = shouldInjectFontOverrides
          ? `
<link rel="stylesheet" href="https://os.ryo.lu/fonts/fonts.css">
<style>img{image-rendering:pixelated!important}body,div,span,p,h1,h2,h3,h4,h5,h6,button,input,select,textarea,[style*="font-family"],[style*="sans-serif"],[style*="SF Pro Text"],[style*="-apple-system"],[style*="BlinkMacSystemFont"],[style*="Segoe UI"],[style*="Roboto"],[style*="Oxygen"],[style*="Ubuntu"],[style*="Cantarell"],[style*="Fira Sans"],[style*="Droid Sans"],[style*="Helvetica Neue"],[style*="Helvetica"],[style*="Arial"],[style*="Verdana"],[style*="Geneva"],[style*="Inter"],[style*="Hiragino Sans"],[style*="Hiragino Kaku Gothic"],[style*="Yu Gothic"],[style*="Meiryo"],[style*="MS PGothic"],[style*="MS Gothic"],[style*="Microsoft YaHei"],[style*="PingFang"],[style*="Noto Sans"],[style*="Source Han Sans"],[style*="WenQuanYi"]{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif!important}[style*="serif"],[style*="Georgia"],[style*="Times New Roman"],[style*="Times"],[style*="Palatino"],[style*="Bookman"],[style*="Garamond"],[style*="Cambria"],[style*="Constantia"],[style*="Hiragino Mincho"],[style*="Yu Mincho"],[style*="MS Mincho"],[style*="SimSun"],[style*="NSimSun"],[style*="Source Han Serif"],[style*="Noto Serif CJK"]{font-family:"Mondwest","Yu Mincho","Hiragino Mincho Pro","Songii TC","Georgia","Palatino","SerenityOS-Emoji",serif!important}code,pre,[style*="monospace"],[style*="Courier New"],[style*="Courier"],[style*="Lucida Console"],[style*="Monaco"],[style*="Consolas"],[style*="Inconsolata"],[style*="Source Code Pro"],[style*="Menlo"],[style*="Andale Mono"],[style*="Ubuntu Mono"]{font-family:"Monaco","ArkPixel","SerenityOS-Emoji",monospace!important}*{font-family:"Geneva-12","ArkPixel","SerenityOS-Emoji",sans-serif}</style>`
          : "";

        const navigationInterceptorScript = `
<script>
(function() {
  'use strict';
  function postNavigation(url, source) {
    try {
      var absoluteUrl = new URL(url, document.baseURI || window.location.href).href;
      if (absoluteUrl.startsWith('javascript:') || absoluteUrl.startsWith('blob:') || absoluteUrl.startsWith('data:') ||
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
  function handleClick(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.button !== 0) return;
    var target = event.target;
    var anchor = null;
    while (target && target !== document.documentElement) {
      if (target.tagName === 'A' && target.href) { anchor = target; break; }
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
  function handleSubmit(event) {
    var form = event.target;
    if (form && form.tagName === 'FORM') {
      var action = form.getAttribute('action') || window.location.href;
      var method = (form.getAttribute('method') || 'GET').toUpperCase();
      if (method === 'GET') {
        var formData = new FormData(form);
        var params = new URLSearchParams();
        formData.forEach(function(value, key) { params.append(key, value); });
        var url = action + (action.indexOf('?') === -1 ? '?' : '&') + params.toString();
        if (postNavigation(url, 'form-get')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }
    }
  }
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
  var locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  if (locationDescriptor && locationDescriptor.configurable !== false) {
    try {
      var originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        get: function() { return originalLocation; },
        set: function(url) { if (postNavigation(url, 'location-set')) { return; } originalLocation.href = url; },
        configurable: true
      });
    } catch (e) {}
  }
  try {
    var loc = window.location;
    var originalAssign = loc.assign;
    var originalReplace = loc.replace;
    if (originalAssign) { loc.assign = function(url) { if (!postNavigation(url, 'location-assign')) { originalAssign.call(loc, url); } }; }
    if (originalReplace) { loc.replace = function(url) { if (!postNavigation(url, 'location-replace')) { originalReplace.call(loc, url); } }; }
    var hrefDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(loc), 'href');
    if (hrefDescriptor && hrefDescriptor.set) {
      var originalHrefSetter = hrefDescriptor.set;
      Object.defineProperty(loc, 'href', {
        get: function() { return loc.href; },
        set: function(url) { if (!postNavigation(url, 'location-href')) { originalHrefSetter.call(loc, url); } },
        configurable: true
      });
    }
  } catch (e) {}
  var makeRelative = function(url) {
    try { if (!url) return url; var parsed = new URL(url, document.baseURI); if (parsed.origin !== window.location.origin) { return parsed.pathname + parsed.search + parsed.hash; } } catch (e) {}
    return url;
  };
  ['pushState', 'replaceState'].forEach(function(fn) {
    var original = history[fn];
    if (typeof original === 'function') {
      history[fn] = function(state, title, url) {
        try { return original.call(this, state, title, makeRelative(url)); }
        catch (err) { console.warn('[IE Proxy] history.' + fn + ' blocked URL', url, err); return original.call(this, state, title, null); }
      };
    }
  });
  var originalOpen = window.open;
  window.open = function(url, target, features) { if (url && postNavigation(url, 'window-open')) { return null; } return originalOpen ? originalOpen.call(window, url, target, features) : null; };
})();
</script>
`;
        const headIndex = html.search(/<head[^>]*>/i);
        if (headIndex !== -1) {
          const insertPos = headIndex + html.match(/<head[^>]*>/i)![0].length;
          html = html.slice(0, insertPos) + baseTag + titleMetaTag + navigationInterceptorScript + fontOverrideStyles + html.slice(insertPos);
        } else {
          html = '<head>' + baseTag + titleMetaTag + navigationInterceptorScript + fontOverrideStyles + '</head>' + html;
        }

        if (pageTitle) {
          res.setHeader("X-Proxied-Page-Title", encodeURIComponent(pageTitle));
        }

        // Cache Wayback content
        if (isWaybackRequest && waybackYear && waybackMonth && contentType.includes("text/html")) {
          try {
            logInfo(requestId, `Attempting to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`);
            const redis = createRedis();
            const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
            if (normalizedUrlForKey) {
              const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:${waybackYear}${waybackMonth}`;
              logInfo(requestId, `Writing to Wayback cache key: ${cacheKey} (content length: ${html.length})`);
              await redis.set(cacheKey, html, { ex: 60 * 60 * 24 * 30 });
              logInfo(requestId, `Successfully cached Wayback content for ${cacheKey}`);
            } else {
              logInfo(requestId, `Skipped Wayback caching - URL normalization failed: ${normalizedUrl}`);
            }
          } catch (cacheErr) {
            logError(requestId, `Failed to cache Wayback content for ${normalizedUrl} (${waybackYear}/${waybackMonth})`, cacheErr);
          }
        }

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(upstreamRes.status).send(html);
      } else {
        logInfo(requestId, "Proxying non-HTML content directly");
        // For non-HTML content, stream the body
        const buffer = await upstreamRes.arrayBuffer();
        if (contentType) {
          res.setHeader("Content-Type", contentType);
        }
        return res.status(upstreamRes.status).send(Buffer.from(buffer));
      }
    } catch (fetchError) {
      clearTimeout(timeout);
      logError(requestId, `Proxy fetch error for ${targetUrl}`, fetchError);
      setCorsHeadersNode(res, effectiveOrigin);
      return res.status(503).json({
        error: true,
        type: "connection_error",
        status: 503,
        message: "The page cannot be displayed. Internet Explorer cannot access this website.",
        details: `Failed to fetch the requested URL. Reason: ${fetchError instanceof Error ? fetchError.message : "Connection failed or timed out"}`,
      });
    }
  } catch (error) {
    logError(requestId, "General handler error", error);
    return errorResponseWithCors((error as Error).message, 500);
  }
}
