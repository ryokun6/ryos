import { decodeHtmlEntitiesOnce } from "./html-entities.js";

export type ProxyResourceType =
  | "document"
  | "style"
  | "script"
  | "image"
  | "media"
  | "font"
  | "xhr"
  | "iframe"
  | "other";

export interface RewriteStats {
  htmlAttributes: number;
  srcset: number;
  cssUrls: number;
  forms: number;
}

export interface RewriteResult {
  html: string;
  stats: RewriteStats;
}

export interface StoredProxyCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresAt: number | null;
  secure: boolean;
  hostOnly: boolean;
  createdAt: number;
}

const BROWSER_PROFILES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="122", "Google Chrome";v="122"',
    platform: '"Windows"',
    language: "en-US,en;q=0.9",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
    secChUa: "",
    platform: '"macOS"',
    language: "en-US,en;q=0.9",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    secChUa: '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
    platform: '"Linux"',
    language: "en-GB,en;q=0.8",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    secChUa: "",
    platform: '"Windows"',
    language: "en-US,en;q=0.8",
  },
];

const RESOURCE_ACCEPT: Record<ProxyResourceType, string> = {
  document:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  style: "text/css,*/*;q=0.1",
  script: "*/*",
  image: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  media: "video/*,audio/*,*/*;q=0.8",
  font: "font/woff2,font/woff,application/font-woff,*/*;q=0.8",
  xhr: "application/json,text/plain,*/*",
  iframe:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  other: "*/*",
};

const RESOURCE_DEST: Record<ProxyResourceType, string> = {
  document: "document",
  style: "style",
  script: "script",
  image: "image",
  media: "video",
  font: "font",
  xhr: "empty",
  iframe: "iframe",
  other: "empty",
};

const SAFE_RESOURCE_TYPES = new Set<ProxyResourceType>([
  "document",
  "style",
  "script",
  "image",
  "media",
  "font",
  "xhr",
  "iframe",
  "other",
]);

export function normalizeProxyResourceType(
  raw: string | string[] | undefined
): ProxyResourceType {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SAFE_RESOURCE_TYPES.has(value as ProxyResourceType)
    ? (value as ProxyResourceType)
    : "document";
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function profileForUrl(targetUrl: string) {
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    return BROWSER_PROFILES[stableHash(hostname) % BROWSER_PROFILES.length];
  } catch {
    return BROWSER_PROFILES[0];
  }
}

export function buildBrowserHeaders(options: {
  targetUrl: string;
  resourceType: ProxyResourceType;
  referrerUrl?: string | null;
  method?: string;
  contentType?: string | null;
  cookieHeader?: string | null;
}): Record<string, string> {
  const profile = profileForUrl(options.targetUrl);
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "User-Agent": profile.ua,
    Accept: RESOURCE_ACCEPT[options.resourceType],
    "Accept-Language": profile.language,
    "Sec-Fetch-Dest": RESOURCE_DEST[options.resourceType],
    "Sec-Fetch-Mode": options.resourceType === "document" ? "navigate" : "no-cors",
    "Sec-Fetch-Site": options.referrerUrl ? "same-origin" : "none",
  };

  if (options.resourceType === "document" && method === "GET") {
    headers["Sec-Fetch-User"] = "?1";
    headers["Upgrade-Insecure-Requests"] = "1";
  }

  if (profile.secChUa) {
    headers["Sec-Ch-Ua"] = profile.secChUa;
    headers["Sec-Ch-Ua-Mobile"] = "?0";
    headers["Sec-Ch-Ua-Platform"] = profile.platform;
  }

  if (options.contentType && method !== "GET" && method !== "HEAD") {
    headers["Content-Type"] = options.contentType;
  }

  if (options.cookieHeader) {
    headers.Cookie = options.cookieHeader;
  }

  try {
    const referrer = options.referrerUrl
      ? new URL(options.referrerUrl).toString()
      : `${new URL(options.targetUrl).origin}/`;
    headers.Referer = referrer;
  } catch {
    // Ignore invalid referrers; the target URL has already been validated elsewhere.
  }

  return headers;
}

function shouldProxyUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  return !/^(?:javascript|data|mailto|tel|blob|about):/i.test(trimmed);
}

export function createProxyUrl(
  rawUrl: string,
  options: {
    baseUrl: string;
    proxyOrigin: string;
    resourceType: ProxyResourceType;
    referrerUrl?: string;
    sessionId?: string | null;
    form?: boolean;
    theme?: string | null;
    decodeHtmlEntities?: boolean;
  }
): string | null {
  const urlForParsing = options.decodeHtmlEntities
    ? decodeHtmlEntitiesOnce(rawUrl)
    : rawUrl;
  if (!shouldProxyUrl(urlForParsing)) return null;
  try {
    const absoluteUrl = new URL(urlForParsing, options.baseUrl);
    if (absoluteUrl.protocol !== "http:" && absoluteUrl.protocol !== "https:") {
      return null;
    }
    const proxyOrigin = new URL(options.proxyOrigin);
    if (
      absoluteUrl.origin === proxyOrigin.origin &&
      absoluteUrl.pathname === "/api/iframe-check"
    ) {
      return null;
    }

    const proxyUrl = new URL("/api/iframe-check", options.proxyOrigin);
    proxyUrl.searchParams.set("url", absoluteUrl.toString());
    proxyUrl.searchParams.set("resource", options.resourceType);
    if (options.referrerUrl) proxyUrl.searchParams.set("ref", options.referrerUrl);
    if (options.sessionId) proxyUrl.searchParams.set("session", options.sessionId);
    if (options.form) proxyUrl.searchParams.set("form", "1");
    if (options.theme && options.resourceType === "document") {
      proxyUrl.searchParams.set("theme", options.theme);
    }
    return proxyUrl.toString();
  } catch {
    return null;
  }
}

export function isBingSearchUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      (hostname === "bing.com" || hostname.endsWith(".bing.com")) &&
      url.pathname.replace(/\/+$/, "") === "/search" &&
      Boolean(url.searchParams.get("q")?.trim())
    );
  } catch {
    return false;
  }
}

export function buildBingRssSearchUrl(rawUrl: string): string | null {
  if (!isBingSearchUrl(rawUrl)) return null;
  const url = new URL(rawUrl);
  url.searchParams.set("format", "rss");
  return url.toString();
}

export function htmlContainsBingChallenge(html: string): boolean {
  return /CfConfig|challenge\/verify|captchaSuccessPostMessage|verificationComplete|One last step|Please solve the challenge/i.test(html);
}

const stripCdata = (value: string): string =>
  value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");

const stripMarkup = (value: string): string =>
  value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const readXmlTag = (xml: string, tagName: string): string => {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match?.[1]) return "";
  return stripMarkup(decodeHtmlEntitiesOnce(stripCdata(match[1]).trim()));
};

export function renderBingRssSearchFallbackHtml(options: {
  originalSearchUrl: string;
  rssUrl: string;
  rssXml: string;
}): string | null {
  if (!isBingSearchUrl(options.originalSearchUrl)) return null;

  const originalUrl = new URL(options.originalSearchUrl);
  const query = originalUrl.searchParams.get("q")?.trim() || "Bing search";
  const items = Array.from(options.rssXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .slice(0, 10)
    .map((match) => {
      const itemXml = match[1] ?? "";
      const title = readXmlTag(itemXml, "title");
      const link = readXmlTag(itemXml, "link");
      const description = readXmlTag(itemXml, "description");
      return { title, link, description };
    })
    .filter((item) => item.title && item.link);

  const resultItems = items.length
    ? items
        .map(
          (item) => `<li class="result"><a href="${escapeHtml(item.link)}">${escapeHtml(
            item.title
          )}</a><p>${escapeHtml(item.description)}</p><span>${escapeHtml(item.link)}</span></li>`
        )
        .join("")
    : `<li class="empty">No RSS results returned for ${escapeHtml(query)}.</li>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(query)} - Search</title>
<style>
body{margin:0;background:#fff;color:#111;font:14px Arial,Helvetica,sans-serif}
header{border-bottom:1px solid #d9d9d9;padding:16px 24px}
h1{font-size:20px;font-weight:400;margin:0}
main{max-width:820px;padding:18px 24px}
.notice{background:#fff8d6;border:1px solid #ead27a;margin:0 0 18px;padding:10px 12px}
ol{list-style:none;margin:0;padding:0}
.result{margin:0 0 18px}
.result a{color:#04c;font-size:18px;text-decoration:underline}
.result p{margin:4px 0;color:#333;line-height:1.35}
.result span{color:#080;font-size:12px}
.empty{color:#555}
</style>
</head>
<body>
<header><h1>Bing results for "${escapeHtml(query)}"</h1></header>
<main>
<p class="notice">Bing returned a browser challenge for the full results page, so ryOS is showing Bing RSS results instead.</p>
<ol>${resultItems}</ol>
<p><a href="${escapeHtml(options.rssUrl)}">Open Bing RSS feed</a></p>
</main>
</body>
</html>`;
}

function rewriteQuotedAttribute(
  tag: string,
  attr: string,
  rewrite: (value: string) => string | null
): { tag: string; changed: number } {
  let changed = 0;
  const quoted = new RegExp(`(\\s${attr}\\s*=\\s*)(["'])([\\s\\S]*?)(\\2)`, "i");
  let next = tag.replace(quoted, (match, prefix, quote, value, suffix) => {
    const rewritten = rewrite(value);
    if (!rewritten || rewritten === value) return match;
    changed += 1;
    return `${prefix}${quote}${rewritten}${suffix}`;
  });

  if (changed > 0) return { tag: next, changed };

  const unquoted = new RegExp(`(\\s${attr}\\s*=\\s*)([^\\s"'=<>` + "`" + `]+)`, "i");
  next = tag.replace(unquoted, (match, prefix, value) => {
    const rewritten = rewrite(value);
    if (!rewritten || rewritten === value) return match;
    changed += 1;
    return `${prefix}"${rewritten}"`;
  });

  return { tag: next, changed };
}

function rewriteSrcset(
  value: string,
  options: Parameters<typeof createProxyUrl>[1]
): string | null {
  let changed = false;
  const rewritten = value
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;
      const match = trimmed.match(/^(\S+)(\s+.+)?$/);
      if (!match) return candidate;
      const proxied = createProxyUrl(match[1], options);
      if (!proxied) return candidate;
      changed = true;
      return `${proxied}${match[2] ?? ""}`;
    })
    .join(", ");
  return changed ? rewritten : null;
}

function rewriteTagAttributes(
  tag: string,
  options: Parameters<typeof createProxyUrl>[1],
  attrs: Array<{ name: string; resourceType: ProxyResourceType; srcset?: boolean }>
): { tag: string; stats: RewriteStats } {
  let next = tag;
  const stats = createEmptyRewriteStats();

  for (const attr of attrs) {
    const attrOptions = {
      ...options,
      resourceType: attr.resourceType,
      decodeHtmlEntities: true,
    };
    const result = rewriteQuotedAttribute(next, attr.name, (value) =>
      attr.srcset
        ? rewriteSrcset(value, attrOptions)
        : createProxyUrl(value, attrOptions)
    );
    next = result.tag;
    if (result.changed > 0) {
      if (attr.srcset) stats.srcset += result.changed;
      else stats.htmlAttributes += result.changed;
    }
  }

  return { tag: next, stats };
}

function createEmptyRewriteStats(): RewriteStats {
  return { htmlAttributes: 0, srcset: 0, cssUrls: 0, forms: 0 };
}

function addStats(target: RewriteStats, source: RewriteStats): void {
  target.htmlAttributes += source.htmlAttributes;
  target.srcset += source.srcset;
  target.cssUrls += source.cssUrls;
  target.forms += source.forms;
}

function resourceTypeForLinkTag(tag: string): ProxyResourceType | null {
  const relMatch = tag.match(/\srel\s*=\s*(["'])(.*?)\1/i);
  const rel = relMatch?.[2]?.toLowerCase() ?? "";
  if (/\bstylesheet\b/.test(rel)) return "style";
  if (/\b(?:preload|modulepreload|prefetch)\b/.test(rel)) {
    const asMatch = tag.match(/\sas\s*=\s*(["'])(.*?)\1/i);
    const asValue = asMatch?.[2]?.toLowerCase() ?? "";
    if (asValue === "script") return "script";
    if (asValue === "style") return "style";
    if (asValue === "image") return "image";
    if (asValue === "font") return "font";
    if (asValue === "video" || asValue === "audio") return "media";
    return "other";
  }
  if (/\b(?:icon|apple-touch-icon|manifest)\b/.test(rel)) return "image";
  return null;
}

export function rewriteCssForProxy(
  css: string,
  options: {
    baseUrl: string;
    proxyOrigin: string;
    referrerUrl?: string;
    sessionId?: string | null;
  }
): { css: string; count: number } {
  let count = 0;
  const proxyOptions = {
    ...options,
    resourceType: "other" as ProxyResourceType,
  };

  let rewritten = css.replace(
    /@import\s+(?:url\(\s*)?(["'])(.*?)\1\s*\)?/gi,
    (match, quote, rawUrl) => {
      const proxied = createProxyUrl(rawUrl, {
        ...proxyOptions,
        resourceType: "style",
      });
      if (!proxied) return match;
      count += 1;
      return `@import ${quote}${proxied}${quote}`;
    }
  );

  rewritten = rewritten.replace(
    /url\(\s*(["']?)(.*?)\1\s*\)/gi,
    (match, quote, rawUrl) => {
      const proxied = createProxyUrl(rawUrl, {
        ...proxyOptions,
        resourceType: "image",
      });
      if (!proxied) return match;
      count += 1;
      return `url(${quote || '"'}${proxied}${quote || '"'})`;
    }
  );

  return { css: rewritten, count };
}

export function rewriteHtmlForProxy(
  html: string,
  options: {
    baseUrl: string;
    proxyOrigin: string;
    referrerUrl?: string;
    sessionId?: string | null;
    theme?: string | null;
  }
): RewriteResult {
  const stats = createEmptyRewriteStats();
  const baseOptions = {
    ...options,
    resourceType: "other" as ProxyResourceType,
  };

  let rewritten = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (tag) => {
    const closeIndex = tag.toLowerCase().lastIndexOf("</style>");
    if (closeIndex === -1) return tag;
    const open = tag.slice(0, tag.indexOf(">") + 1);
    const content = tag.slice(open.length, closeIndex);
    const close = tag.slice(closeIndex);
    const cssResult = rewriteCssForProxy(content, baseOptions);
    stats.cssUrls += cssResult.count;
    return `${open}${cssResult.css}${close}`;
  });

  rewritten = rewritten.replace(/<script\b[^>]*>/gi, (tag) => {
    const result = rewriteTagAttributes(rewriteNonceAndIntegrity(tag), baseOptions, [
      { name: "src", resourceType: "script" },
    ]);
    addStats(stats, result.stats);
    return result.tag;
  });

  rewritten = rewritten.replace(/<link\b[^>]*>/gi, (tag) => {
    const resourceType = resourceTypeForLinkTag(tag);
    if (!resourceType) return tag;
    const result = rewriteTagAttributes(rewriteNonceAndIntegrity(tag), baseOptions, [
      { name: "href", resourceType },
    ]);
    addStats(stats, result.stats);
    return result.tag;
  });

  rewritten = rewritten.replace(
    /<(?:img|source|video|audio|track|embed|object)\b[^>]*>/gi,
    (tag) => {
      const result = rewriteTagAttributes(tag, baseOptions, [
        { name: "src", resourceType: "image" },
        { name: "data", resourceType: "other" },
        { name: "poster", resourceType: "image" },
        { name: "srcset", resourceType: "image", srcset: true },
      ]);
      addStats(stats, result.stats);
      return result.tag;
    }
  );

  rewritten = rewritten.replace(/<iframe\b[^>]*>/gi, (tag) => {
    const result = rewriteTagAttributes(tag, baseOptions, [
      { name: "src", resourceType: "iframe" },
    ]);
    addStats(stats, result.stats);
    return result.tag;
  });

  rewritten = rewritten.replace(/<form\b[^>]*>/gi, (tag) => {
    const result = rewriteTagAttributes(
      tag,
      { ...baseOptions, resourceType: "document", form: true },
      [{ name: "action", resourceType: "document" }]
    );
    stats.forms += result.stats.htmlAttributes;
    stats.htmlAttributes += result.stats.htmlAttributes;
    return result.tag;
  });

  return { html: rewritten, stats };
}

function rewriteNonceAndIntegrity(tag: string): string {
  // Rewritten scripts/stylesheets are no longer byte-identical to upstream assets.
  return tag
    .replace(/\snonce\s*=\s*(["']).*?\1/gi, "")
    .replace(/\sintegrity\s*=\s*(["']).*?\1/gi, "");
}

function defaultCookiePath(pathname: string): string {
  if (!pathname || !pathname.startsWith("/")) return "/";
  if (pathname === "/") return "/";
  const slashIndex = pathname.lastIndexOf("/");
  return slashIndex <= 0 ? "/" : pathname.slice(0, slashIndex);
}

function domainMatches(hostname: string, domain: string, hostOnly: boolean): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase().replace(/^\./, "");
  if (hostOnly) return normalizedHostname === normalizedDomain;
  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

function pathMatches(requestPath: string, cookiePath: string): boolean {
  if (cookiePath === "/") return true;
  return requestPath === cookiePath || requestPath.startsWith(`${cookiePath}/`);
}

export function getSetCookieHeaders(headers: Headers): string[] {
  const maybeGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };
  const direct = maybeGetSetCookie.getSetCookie?.();
  if (direct?.length) return direct;
  const raw = maybeGetSetCookie.raw?.()["set-cookie"];
  if (raw?.length) return raw;
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return combined.split(/,(?=\s*[^;,=\s]+=[^;,]*)/g).map((value) => value.trim());
}

export function mergeProxyCookies(
  currentCookies: StoredProxyCookie[],
  setCookieHeaders: string[],
  responseUrl: string,
  now = Date.now()
): StoredProxyCookie[] {
  if (!setCookieHeaders.length) return currentCookies;
  const response = new URL(responseUrl);
  const hostname = response.hostname.toLowerCase();
  const merged = currentCookies.filter(
    (cookie) => !cookie.expiresAt || cookie.expiresAt > now
  );

  for (const header of setCookieHeaders.slice(0, 20)) {
    const parts = header.split(";").map((part) => part.trim());
    const [nameValue, ...attributes] = parts;
    const separatorIndex = nameValue.indexOf("=");
    if (separatorIndex <= 0) continue;

    const name = nameValue.slice(0, separatorIndex).trim();
    const value = nameValue.slice(separatorIndex + 1);
    if (!name || name.length > 128 || value.length > 4096) continue;

    let domain = hostname;
    let hostOnly = true;
    let path = defaultCookiePath(response.pathname);
    let expiresAt: number | null = null;
    let maxAge: number | null = null;
    let secure = false;

    for (const attribute of attributes) {
      const [rawKey, ...rawValueParts] = attribute.split("=");
      const key = rawKey.trim().toLowerCase();
      const attrValue = rawValueParts.join("=").trim();
      if (key === "domain" && attrValue) {
        const normalizedDomain = attrValue.toLowerCase().replace(/^\./, "");
        if (domainMatches(hostname, normalizedDomain, false)) {
          domain = normalizedDomain;
          hostOnly = false;
        }
      } else if (key === "path" && attrValue.startsWith("/")) {
        path = attrValue;
      } else if (key === "expires") {
        const parsed = Date.parse(attrValue);
        if (!Number.isNaN(parsed)) expiresAt = parsed;
      } else if (key === "max-age") {
        const parsed = Number.parseInt(attrValue, 10);
        if (Number.isFinite(parsed)) maxAge = parsed;
      } else if (key === "secure") {
        secure = true;
      }
    }

    if (maxAge !== null) {
      expiresAt = maxAge <= 0 ? now - 1 : now + maxAge * 1000;
    }

    const existingIndex = merged.findIndex(
      (cookie) =>
        cookie.name === name &&
        cookie.domain === domain &&
        cookie.path === path &&
        cookie.hostOnly === hostOnly
    );

    if (expiresAt !== null && expiresAt <= now) {
      if (existingIndex !== -1) merged.splice(existingIndex, 1);
      continue;
    }

    const nextCookie: StoredProxyCookie = {
      name,
      value,
      domain,
      path,
      expiresAt,
      secure,
      hostOnly,
      createdAt: now,
    };

    if (existingIndex === -1) merged.push(nextCookie);
    else merged[existingIndex] = nextCookie;
  }

  return merged
    .sort((a, b) => b.path.length - a.path.length || a.createdAt - b.createdAt)
    .slice(0, 80);
}

export function getCookieHeaderForUrl(
  cookies: StoredProxyCookie[],
  targetUrl: string,
  now = Date.now()
): string | null {
  const target = new URL(targetUrl);
  const matching = cookies.filter((cookie) => {
    if (cookie.expiresAt && cookie.expiresAt <= now) return false;
    if (cookie.secure && target.protocol !== "https:") return false;
    if (!domainMatches(target.hostname, cookie.domain, cookie.hostOnly)) return false;
    return pathMatches(target.pathname || "/", cookie.path || "/");
  });

  if (!matching.length) return null;
  return matching
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ")
    .slice(0, 8192);
}
