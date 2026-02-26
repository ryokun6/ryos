import { Redis } from "@upstash/redis";
import * as RateLimit from "../_utils/_rate-limit.js";
import { normalizeUrlForCacheKey } from "../_utils/_url.js";
import { safeFetchWithRedirects, validatePublicUrl, SsrfBlockedError } from "../_utils/_ssrf.js";
import type { CoreResponse } from "../_runtime/core-types.js";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

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
const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

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

const IE_CACHE_PREFIX = "ie:cache:";
const WAYBACK_CACHE_PREFIX = "wayback:cache:";

export type IframeCheckCoreResult = {
  response: CoreResponse;
  bodyType: "json" | "text" | "binary";
};

const jsonResult = (
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): IframeCheckCoreResult => ({
  response: { status, body, headers },
  bodyType: "json",
});

const textResult = (
  status: number,
  body: string,
  headers: Record<string, string> = {}
): IframeCheckCoreResult => ({
  response: { status, body, headers },
  bodyType: "text",
});

const binaryResult = (
  status: number,
  body: Uint8Array,
  headers: Record<string, string> = {}
): IframeCheckCoreResult => ({
  response: { status, body, headers },
  bodyType: "binary",
});

interface IframeCheckCoreInput {
  originAllowed: boolean;
  query: Record<string, string | string[] | undefined>;
  effectiveOrigin: string | null;
  clientIp: string;
}

export async function executeIframeCheckCore(
  input: IframeCheckCoreInput
): Promise<IframeCheckCoreResult> {
  const urlParam = input.query.url as string | undefined;
  let mode = (input.query.mode as string | undefined) || "proxy";
  const year = input.query.year as string | undefined;
  const month = input.query.month as string | undefined;

  if (!input.originAllowed) {
    return textResult(403, "Unauthorized");
  }

  const BROWSER_HEADERS = generateRandomBrowserHeaders();

  const errorResponseWithCors = (message: string, status: number = 400) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (input.effectiveOrigin) {
      headers["Access-Control-Allow-Origin"] = input.effectiveOrigin;
    }
    return jsonResult(status, { error: message }, headers);
  };

  if (!urlParam) {
    return errorResponseWithCors("Missing 'url' query parameter");
  }

  const normalizedUrl = urlParam.startsWith("http") ? urlParam : `https://${urlParam}`;

  try {
    await validatePublicUrl(normalizedUrl);
  } catch (error) {
    const message =
      error instanceof SsrfBlockedError ? error.message : "Invalid URL format";
    return errorResponseWithCors(message, 400);
  }

  try {
    const BURST_WINDOW = 60;
    const burstKeyBase = ["rl", "iframe", mode, "ip", input.clientIp];

    if (mode === "proxy" || mode === "check") {
      const globalKey = RateLimit.makeKey(burstKeyBase);
      const global = await RateLimit.checkCounterLimit({
        key: globalKey,
        windowSeconds: BURST_WINDOW,
        limit: 300,
      });
      if (!global.allowed) {
        const headers: Record<string, string> = {
          "Retry-After": String(global.resetSeconds ?? BURST_WINDOW),
          "Content-Type": "application/json",
        };
        if (input.effectiveOrigin) {
          headers["Access-Control-Allow-Origin"] = input.effectiveOrigin;
        }
        return jsonResult(
          429,
          {
            error: "rate_limit_exceeded",
            scope: "global",
            mode,
          },
          headers
        );
      }

      try {
        const hostname = new URL(
          urlParam.startsWith("http") ? urlParam : `https://${urlParam}`
        ).hostname.toLowerCase();
        const hostKey = RateLimit.makeKey([
          "rl",
          "iframe",
          mode,
          "ip",
          input.clientIp,
          "host",
          hostname,
        ]);
        const host = await RateLimit.checkCounterLimit({
          key: hostKey,
          windowSeconds: BURST_WINDOW,
          limit: 100,
        });
        if (!host.allowed) {
          const headers: Record<string, string> = {
            "Retry-After": String(host.resetSeconds ?? BURST_WINDOW),
            "Content-Type": "application/json",
          };
          if (input.effectiveOrigin) {
            headers["Access-Control-Allow-Origin"] = input.effectiveOrigin;
          }
          return jsonResult(
            429,
            {
              error: "rate_limit_exceeded",
              scope: "host",
              host: hostname,
              mode,
            },
            headers
          );
        }
      } catch {
        // ignore invalid host parse
      }
    } else if (mode === "ai" || mode === "list-cache") {
      const key = RateLimit.makeKey(burstKeyBase);
      const rateRes = await RateLimit.checkCounterLimit({
        key,
        windowSeconds: BURST_WINDOW,
        limit: 120,
      });
      if (!rateRes.allowed) {
        const headers: Record<string, string> = {
          "Retry-After": String(rateRes.resetSeconds ?? BURST_WINDOW),
          "Content-Type": "application/json",
        };
        if (input.effectiveOrigin) {
          headers["Access-Control-Allow-Origin"] = input.effectiveOrigin;
        }
        return jsonResult(429, { error: "rate_limit_exceeded", scope: mode }, headers);
      }
    }
  } catch {
    // fail open
  }

  if (mode === "ai") {
    if (!year) {
      return errorResponseWithCors("Missing year parameter");
    }

    const isValidYear =
      /^\d{1,4}( BC)?$/.test(year) || /^\d+ CE$/.test(year) || year === "current";
    if (!isValidYear) {
      return errorResponseWithCors("Invalid year format");
    }

    const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
    if (!normalizedUrlForKey) {
      return errorResponseWithCors("URL normalization failed", 500);
    }

    try {
      const redis = createRedis();
      const key = `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:${year}`;
      const html = (await redis.lindex(key, 0)) as string | null;
      if (html) {
        return textResult(200, html, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "X-AI-Cache": "HIT",
        });
      }
      return jsonResult(
        404,
        { aiCache: false },
        {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      );
    } catch (e) {
      return jsonResult(500, { error: (e as Error).message }, { "Content-Type": "application/json" });
    }
  }

  if (mode === "list-cache") {
    const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
    if (!normalizedUrlForKey) {
      return errorResponseWithCors("URL normalization failed", 500);
    }

    try {
      const redis = createRedis();
      const uniqueYears = new Set<string>();

      const aiPattern = `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:*`;
      const aiKeyPrefixLength =
        `${IE_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:`.length;
      let aiCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(aiCursor, {
          match: aiPattern,
          count: 100,
        });
        aiCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearPart = key.substring(aiKeyPrefixLength);
          if (yearPart && /^(\d{1,4}( BC)?|\d+ CE)$/.test(yearPart)) {
            uniqueYears.add(yearPart);
          }
        }
      } while (aiCursor !== 0);

      const waybackPattern = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
        normalizedUrlForKey
      )}:*`;
      const waybackKeyPrefixLength =
        `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(normalizedUrlForKey)}:`.length;
      let waybackCursor = 0;
      do {
        const [nextCursor, keys] = await redis.scan(waybackCursor, {
          match: waybackPattern,
          count: 100,
        });
        waybackCursor = parseInt(nextCursor as unknown as string, 10);
        for (const key of keys) {
          const yearMonthPart = key.substring(waybackKeyPrefixLength);
          if (yearMonthPart && /^\d{6}$/.test(yearMonthPart)) {
            uniqueYears.add(yearMonthPart.substring(0, 4));
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

      return jsonResult(
        200,
        { years: sortedYears },
        {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      );
    } catch (e) {
      return jsonResult(
        500,
        { error: (e as Error).message },
        { "Content-Type": "application/json" }
      );
    }
  }

  const isAutoProxyDomain = shouldAutoProxy(normalizedUrl);
  if (isAutoProxyDomain && mode === "check") {
    return jsonResult(200, { allowed: false, reason: "Auto-proxied domain" }, {
      "Content-Type": "application/json",
    });
  }

  const theme = ((input.query.theme as string) || "").toLowerCase();
  const shouldInjectFontOverrides = theme !== "macosx";

  let targetUrl = normalizedUrl;
  let isWaybackRequest = false;
  let waybackYear: string | null = null;
  let waybackMonth: string | null = null;

  if (year && month && mode === "proxy") {
    if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month)) {
      targetUrl = `https://web.archive.org/web/${year}${month}01/${normalizedUrl}`;
      isWaybackRequest = true;
      waybackYear = year;
      waybackMonth = month;
    } else {
      return errorResponseWithCors("Invalid year/month format for Wayback proxy");
    }
  }

  if (isWaybackRequest && waybackYear && waybackMonth) {
    try {
      const redis = createRedis();
      const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
      if (normalizedUrlForKey) {
        const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
          normalizedUrlForKey
        )}:${waybackYear}${waybackMonth}`;
        const cachedContent = (await redis.get(cacheKey)) as string | null;
        if (cachedContent) {
          return textResult(200, cachedContent, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "X-Wayback-Cache": "HIT",
          });
        }
      }
    } catch {
      // continue
    }
  }

  if (isAutoProxyDomain && !isWaybackRequest && mode !== "proxy") {
    mode = "proxy";
  }

  const checkSiteEmbeddingAllowed = async () => {
    try {
      const { response: fetchRes } = await safeFetchWithRedirects(
        targetUrl,
        {
          method: "GET",
          headers: BROWSER_HEADERS,
        },
        { maxRedirects: 5 }
      );

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
          pageTitle = titleMatch[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
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

      return { allowed, reason: finalReason, title: pageTitle };
    } catch (error) {
      return {
        allowed: false,
        reason: `Proxy check failed: ${(error as Error).message}`,
      };
    }
  };

  try {
    if (mode === "check") {
      const result = await checkSiteEmbeddingAllowed();
      return jsonResult(200, result, { "Content-Type": "application/json" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const { response: upstreamRes, finalUrl } = await safeFetchWithRedirects(
        targetUrl,
        {
          method: "GET",
          signal: controller.signal,
          headers: BROWSER_HEADERS,
        },
        { maxRedirects: 5 }
      );

      clearTimeout(timeout);

      if (!upstreamRes.ok) {
        return jsonResult(
          upstreamRes.status,
          {
            error: true,
            status: upstreamRes.status,
            statusText: upstreamRes.statusText || "File not found",
            type: "http_error",
            message: `The page cannot be found. HTTP ${upstreamRes.status} - ${
              upstreamRes.statusText || "File not found"
            }`,
          },
          {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          }
        );
      }

      const contentType = upstreamRes.headers.get("content-type") || "";
      let pageTitle: string | undefined = undefined;

      const baseHeaders: Record<string, string> = {
        "content-security-policy":
          "frame-ancestors *; sandbox allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock",
        "access-control-allow-origin": "*",
      };

      if (contentType.includes("text/html")) {
        let html = await upstreamRes.text();

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1]
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
        }

        const baseTag = `<base href="${finalUrl}">`;
        const titleMetaTag = pageTitle
          ? `<meta name="page-title" content="${encodeURIComponent(pageTitle)}">`
          : "";

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
      if (absoluteUrl.startsWith('javascript:') ||
          absoluteUrl.startsWith('blob:') ||
          absoluteUrl.startsWith('data:') ||
          (absoluteUrl.indexOf('#') !== -1 && absoluteUrl.split('#')[0] === window.location.href.split('#')[0])) {
        return false;
      }
      window.parent.postMessage({ type: 'iframeNavigation', url: absoluteUrl, source: source }, '*');
      return true;
    } catch (e) {
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
        try { return original.call(this, state, title, makeRelative(url)); }
        catch (err) { return original.call(this, state, title, null); }
      };
    }
  });
  var originalOpen = window.open;
  window.open = function(url, target, features) {
    if (url && postNavigation(url, 'window-open')) { return null; }
    return originalOpen ? originalOpen.call(window, url, target, features) : null;
  };
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
            navigationInterceptorScript +
            fontOverrideStyles +
            html.slice(insertPos);
        } else {
          html =
            "<head>" +
            baseTag +
            titleMetaTag +
            navigationInterceptorScript +
            fontOverrideStyles +
            "</head>" +
            html;
        }

        if (isWaybackRequest && waybackYear && waybackMonth && contentType.includes("text/html")) {
          try {
            const redis = createRedis();
            const normalizedUrlForKey = normalizeUrlForCacheKey(normalizedUrl);
            if (normalizedUrlForKey) {
              const cacheKey = `${WAYBACK_CACHE_PREFIX}${encodeURIComponent(
                normalizedUrlForKey
              )}:${waybackYear}${waybackMonth}`;
              await redis.set(cacheKey, html, { ex: 60 * 60 * 24 * 30 });
            }
          } catch {
            // ignore cache write errors
          }
        }

        const headers: Record<string, string> = {
          ...baseHeaders,
          "Content-Type": "text/html; charset=utf-8",
        };
        if (pageTitle) {
          headers["X-Proxied-Page-Title"] = encodeURIComponent(pageTitle);
        }
        return textResult(upstreamRes.status, html, headers);
      }

      const arrayBuffer = await upstreamRes.arrayBuffer();
      return binaryResult(upstreamRes.status, new Uint8Array(arrayBuffer), {
        ...baseHeaders,
        "Content-Type": contentType,
      });
    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError instanceof SsrfBlockedError) {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (input.effectiveOrigin) {
          headers["Access-Control-Allow-Origin"] = input.effectiveOrigin;
        }
        return jsonResult(
          400,
          {
            error: true,
            type: "ssrf_blocked",
            status: 400,
            message: fetchError.message,
          },
          headers
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (input.effectiveOrigin) {
        headers["Access-Control-Allow-Origin"] = input.effectiveOrigin;
      }
      return jsonResult(
        503,
        {
          error: true,
          type: "connection_error",
          status: 503,
          message:
            "The page cannot be displayed. Internet Explorer cannot access this website.",
          details: `Failed to fetch the requested URL. Reason: ${
            fetchError instanceof Error
              ? fetchError.message
              : "Connection failed or timed out"
          }`,
        },
        headers
      );
    }
  } catch (error) {
    return errorResponseWithCors((error as Error).message, 500);
  }
}
