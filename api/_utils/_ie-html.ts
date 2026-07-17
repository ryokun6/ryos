/**
 * Helpers for keeping Internet Explorer proxied HTML bounded so a single
 * oversized modern page cannot freeze the shared browser tab (ryOS desktop).
 *
 * Proxied pages are same-origin to the shell, so their scripts share the main
 * thread. Cap body size and, for oversized documents, serve a lite/reader
 * view instead of the full interactive page.
 */

import { decodeHtmlEntitiesOnce } from "./html-entities.js";

/** Hard ceiling for buffered HTML. Above this we refuse to embed the page. */
export const IE_MAX_HTML_BYTES = 2_500_000;

/**
 * When HTML exceeds this size, serve a lite/reader view (extracted article
 * content) instead of the full document. Our navigation interceptor is still
 * injected afterward by the proxy.
 */
export const IE_LITE_THRESHOLD_BYTES = 350_000;

/** @deprecated Alias kept for existing imports/tests. */
export const IE_SCRIPT_STRIP_THRESHOLD_BYTES = IE_LITE_THRESHOLD_BYTES;

/** How much of an HTML body to scan for `<title>` / meta CSP in check mode. */
export const IE_HTML_HEAD_SCAN_BYTES = 64_000;

/** Soft ceiling for lite-view body markup (keeps the iframe cheap to parse). */
export const IE_LITE_CONTENT_MAX_BYTES = 180_000;

export class IeHtmlTooLargeError extends Error {
  readonly byteLength: number;
  readonly maxBytes: number;

  constructor(byteLength: number, maxBytes: number = IE_MAX_HTML_BYTES) {
    super(
      `HTML response is too large to display safely (${byteLength} bytes; limit ${maxBytes}).`
    );
    this.name = "IeHtmlTooLargeError";
    this.byteLength = byteLength;
    this.maxBytes = maxBytes;
  }
}

/**
 * Read a Response body as text, aborting once `maxBytes` would be exceeded.
 * Prefer Content-Length when present so we can fail before buffering.
 */
export async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number = IE_MAX_HTML_BYTES
): Promise<string> {
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      try {
        response.body?.cancel();
      } catch {
        /* ignore */
      }
      throw new IeHtmlTooLargeError(contentLength, maxBytes);
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      total += value.length;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        throw new IeHtmlTooLargeError(total, maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/**
 * Read only a prefix of the body (for title / meta scans) without buffering
 * the rest. Cancels the stream after `maxBytes`.
 */
export async function readResponseTextPrefix(
  response: Response,
  maxBytes: number = IE_HTML_HEAD_SCAN_BYTES
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      const remaining = maxBytes - total;
      if (remaining <= 0) break;
      if (value.length <= remaining) {
        chunks.push(value);
        total += value.length;
      } else {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

const TAG_RE = /<\/?([a-zA-Z0-9:-]+)(\s[^>]*)?>/g;

/** Tags removed entirely from reader-mode article markup. */
const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "template",
]);

/** Tags unwrapped (keep children) after attribute scrubbing. */
const UNWRAP_TAGS = new Set(["div", "span", "section"]);

/** Containers that may be dropped when class/id looks like page chrome. */
const NOISE_CONTAINER_TAGS = new Set([
  "div",
  "section",
  "ul",
  "ol",
  "aside",
  "nav",
]);

/**
 * Run HTMLRewriter over a string. Pass a string (not Response) so Bun returns
 * a string synchronously — important under aggregate unit tests where happy-dom
 * replaces the global Response constructor and breaks HTMLRewriter.
 */
function rewriteHtml(
  html: string,
  configure: (rewriter: HTMLRewriter) => HTMLRewriter
): string {
  const result = configure(new HTMLRewriter()).transform(html);
  if (typeof result === "string") return result;
  // Fallback for older Bun typings / Response-shaped returns.
  throw new TypeError("HTMLRewriter.transform(string) did not return a string");
}

/**
 * Remove page `<script>` elements via HTMLRewriter (parser-based, not regex).
 * Caller re-injects the IE navigation interceptor.
 */
export async function stripHtmlScripts(html: string): Promise<string> {
  return rewriteHtml(html, (rewriter) =>
    rewriter.on("script", {
      element(el) {
        el.remove();
      },
    })
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(html: string): string {
  return decodeHtmlEntitiesOnce(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i"
    );
    const match = html.match(re);
    const value = match?.[1] || match?.[2];
    if (value) return decodeHtmlEntitiesOnce(value.trim());
  }
  return null;
}

function extractTitle(html: string): string {
  // Prefer the on-page headline for reader mode when present.
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) {
    const h1 = stripTags(h1Match[1]);
    if (h1.length >= 8) return h1;
  }
  const og = metaContent(html, ["og:title", "twitter:title"]);
  if (og) return og;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return decodeHtmlEntitiesOnce(titleMatch[1].trim());
  return "Untitled page";
}

/**
 * Extract the inner HTML of the first balanced match for `tagName`, optionally
 * requiring a predicate on the opening tag attributes.
 */
function extractBalancedInner(
  html: string,
  tagName: string,
  openTagPredicate?: (openTag: string) => boolean
): string | null {
  const openRe = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
  let openMatch: RegExpExecArray | null;
  while ((openMatch = openRe.exec(html))) {
    const openTag = openMatch[0];
    if (openTagPredicate && !openTagPredicate(openTag)) continue;
    const start = openMatch.index + openTag.length;
    let depth = 1;
    TAG_RE.lastIndex = start;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = TAG_RE.exec(html))) {
      const name = tagMatch[1].toLowerCase();
      if (name !== tagName.toLowerCase()) continue;
      const isClose = tagMatch[0].startsWith("</");
      const isSelfClosing = /\/>\s*$/.test(tagMatch[0]);
      if (isClose) depth -= 1;
      else if (!isSelfClosing) depth += 1;
      if (depth === 0) {
        return html.slice(start, tagMatch.index);
      }
    }
  }
  return null;
}

const NOISE_CLASS_RE =
  /\b(?:share|social|newsletter|subscribe|cookie|consent|related|recommend|promo|advert|ads?|kiosq|utility-bar|trending|comments?|viafoura|breadcrumb|masthead|site-logo|skip-to|video|jwplayer|carousel|playlist)\b/i;

function isBoilerplateParagraph(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("affiliate commission") ||
    lower.includes("subscribe to our newsletter") ||
    lower.includes("get the what hi-fi") ||
    lower.includes("newsletter") ||
    lower.includes("join the conversation") ||
    lower.includes("preferred source on google") ||
    lower.includes("sign up for") ||
    lower.includes("cookie") ||
    lower.includes("latest videos") ||
    lower.includes("watch full video") ||
    lower.includes("watch now") ||
    /^(copy link|facebook|whatsapp|pinterest|flipboard|email|share this)/i.test(
      text
    )
  );
}

function extractByline(html: string): string | null {
  let author =
    metaContent(html, [
      "author",
      "byl",
      "sailthru.author",
    ]) || null;
  // Skip URL-ish author values (common in og:article:author).
  if (author && /^https?:\/\//i.test(author)) {
    author = null;
  }

  // JSON-LD author.name
  if (!author) {
    const jsonLdAuthor = html.match(
      /"author"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i
    );
    if (jsonLdAuthor?.[1]) author = decodeHtmlEntitiesOnce(jsonLdAuthor[1]);
  }

  // /author/lewis-empson → Lewis Empson
  if (!author) {
    const authorUrl =
      metaContent(html, ["article:author", "og:article:author"]) || "";
    const slug = authorUrl.match(/\/author\/([^/?#]+)/i)?.[1];
    if (slug) {
      author = decodeURIComponent(slug)
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  // Visible byline near the headline when meta author is missing.
  if (!author) {
    const byMatch = html.match(
      /(?:itemprop|rel)=["']author["'][^>]*>([\s\S]{0,120}?)<\/(?:a|span|div|p)/i
    );
    if (byMatch?.[1]) {
      const text = stripTags(byMatch[1]).replace(/^by\s+/i, "").trim();
      if (text && text.length < 80 && !/^https?:\/\//i.test(text)) {
        author = text;
      }
    }
  }

  const published =
    metaContent(html, [
      "article:published_time",
      "og:article:published_time",
      "pubdate",
      "publish-date",
      "DC.date.issued",
    ]) || null;

  const bits: string[] = [];
  if (author) bits.push(author.replace(/^by\s+/i, ""));
  if (published) {
    const parsed = Date.parse(published);
    if (!Number.isNaN(parsed)) {
      bits.push(
        new Date(parsed).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    } else if (!/^https?:\/\//i.test(published)) {
      bits.push(published);
    }
  }
  return bits.length ? bits.join(" · ") : null;
}

/**
 * Parser-based cleanup for reader-mode article fragments. Uses HTMLRewriter
 * instead of regex so nested/malformed tags and event handlers are handled
 * correctly (and CodeQL incomplete-sanitization rules stay quiet).
 */
async function cleanExtractedMarkup(html: string): Promise<string> {
  const cleaned = rewriteHtml(html, (rewriter) =>
    rewriter.on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (DROP_TAGS.has(tag)) {
          el.remove();
          return;
        }

        const cls = el.getAttribute("class") || "";
        const id = el.getAttribute("id") || "";
        if (
          NOISE_CONTAINER_TAGS.has(tag) &&
          (NOISE_CLASS_RE.test(cls) || NOISE_CLASS_RE.test(id))
        ) {
          el.remove();
          return;
        }

        const attrNames: string[] = [];
        for (const [name] of el.attributes) {
          attrNames.push(name);
        }
        for (const name of attrNames) {
          const lower = name.toLowerCase();
          if (
            lower.startsWith("on") ||
            lower === "style" ||
            lower === "class" ||
            lower === "id" ||
            lower.startsWith("data-")
          ) {
            el.removeAttribute(name);
          }
        }

        if (UNWRAP_TAGS.has(tag)) {
          el.removeAndKeepContent();
        }
      },
      comments(comment) {
        comment.remove();
      },
    })
  );

  return cleaned.replace(/(?:\s*\n){3,}/g, "\n\n").trim();
}

function truncateHtml(html: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(html);
  if (encoded.byteLength <= maxBytes) return html;
  const sliced = encoded.slice(0, maxBytes);
  let text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  // Avoid ending mid-tag.
  const lastLt = text.lastIndexOf("<");
  const lastGt = text.lastIndexOf(">");
  if (lastLt > lastGt) text = text.slice(0, lastLt);
  return `${text}\n<p class="ie-reader-truncated"><em>…article truncated for performance.</em></p>`;
}

function collectFallbackBlocks(html: string): string {
  const parts: string[] = [];

  const paragraphRe = /<(p|h2|h3|blockquote)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraphRe.exec(html))) {
    const text = stripTags(match[0]);
    if (text.length < 50) continue;
    if (isBoilerplateParagraph(text)) continue;
    parts.push(match[0]);
    if (parts.join("").length > IE_LITE_CONTENT_MAX_BYTES) break;
  }

  return parts.join("\n");
}

function extractHeroImage(html: string): string | null {
  return metaContent(html, ["og:image", "twitter:image", "og:image:url"]);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Build a proper Reader Mode document from a heavy page so IE can show the
 * article without parsing/executing the full modern site bundle.
 */
export async function buildLiteHtml(
  html: string,
  pageUrl: string
): Promise<string> {
  const title = extractTitle(html);
  const rawDescription =
    metaContent(html, ["og:description", "description", "twitter:description"]) ||
    "";
  // Skip truncated / junk descriptions (e.g. cut-off OG text).
  const description =
    rawDescription.length >= 20 && !/^[.\s]*$/.test(rawDescription)
      ? rawDescription
      : "";
  const byline = extractByline(html);
  const heroImage = extractHeroImage(html);
  const host = hostnameOf(pageUrl);

  let body =
    extractBalancedInner(html, "div", (open) =>
      /class\s*=\s*["'][^"']*(?:article-body|article__body|post-content|entry-content|content-body|article__content)[^"']*["']/i.test(
        open
      )
    ) ||
    extractBalancedInner(html, "article") ||
    extractBalancedInner(html, "main") ||
    extractBalancedInner(html, "div", (open) =>
      /role\s*=\s*["']main["']/i.test(open)
    );

  if (body) {
    body = await cleanExtractedMarkup(body);
    // Avoid repeating the page title / hero already shown in the reader chrome.
    body = body.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, "");
    if (heroImage) {
      const escaped = heroImage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      body = body.replace(
        new RegExp(`<img\\b[^>]*src=["']${escaped}["'][^>]*>`, "i"),
        ""
      );
    }
  }
  if (!body || stripTags(body).length < 120) {
    body = await cleanExtractedMarkup(collectFallbackBlocks(html));
  }

  // Keep only contentful blocks; drop leftover boilerplate paragraphs.
  body = body
    .split(/(?=<p\b|<h[2-6]\b|<blockquote\b|<figure\b|<img\b|<ul\b|<ol\b)/i)
    .filter((chunk) => {
      const text = stripTags(chunk);
      if (!text && /<img\b/i.test(chunk)) return true;
      if (text.length < 2) return false;
      return !isBoilerplateParagraph(text);
    })
    .join("\n");

  body = truncateHtml(body, IE_LITE_CONTENT_MAX_BYTES);

  const safeTitle = escapeHtml(title);
  const safeDescription = description ? escapeHtml(description) : "";
  const safeUrl = escapeHtml(pageUrl);
  const safeHost = escapeHtml(host);
  const safeByline = byline ? escapeHtml(byline) : "";
  const safeHero = heroImage ? escapeHtml(heroImage) : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta name="page-title" content="${encodeURIComponent(title)}">
<meta name="ie-lite-view" content="1">
<link rel="stylesheet" href="/fonts/fonts.css">
<style>
  :root {
    --reader-bg: #dfe6ee;
    --reader-paper: #fbfcfd;
    --reader-ink: #1a1f26;
    --reader-muted: #5a6570;
    --reader-rule: #c5ced8;
    --reader-link: #0b4f9c;
    --reader-bar: #2c3640;
    --reader-bar-text: #f3f6f9;
    --reader-accent: #3d7ab5;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--reader-bg);
    color: var(--reader-ink);
    font-family: "EB Garamond", "AppleGaramond", Georgia, "Times New Roman", serif;
  }
  body {
    min-height: 100%;
    background-image:
      radial-gradient(ellipse at top, rgba(255,255,255,.55), transparent 55%),
      linear-gradient(180deg, #d5dee8 0%, var(--reader-bg) 28%, #d7dde5 100%);
  }
  .ie-reader-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 18px;
    background: linear-gradient(180deg, #3a4652 0%, var(--reader-bar) 100%);
    color: var(--reader-bar-text);
    font-family: "Geneva-12", "Lucida Grande", Geneva, Helvetica, Arial, sans-serif;
    font-size: 12px;
    letter-spacing: 0.01em;
    border-bottom: 1px solid #1c242c;
    box-shadow: 0 1px 0 rgba(255,255,255,.08) inset;
  }
  .ie-reader-bar strong {
    font-family: "Mondwest", "Geneva-12", sans-serif;
    font-weight: normal;
    font-size: 14px;
    letter-spacing: 0.02em;
  }
  .ie-reader-bar a {
    color: #9fd0ff;
    text-decoration: none;
    border-bottom: 1px solid rgba(159,208,255,.35);
  }
  .ie-reader-bar a:hover { color: #fff; border-bottom-color: #fff; }
  .ie-reader-shell {
    max-width: 42rem;
    margin: 0 auto;
    padding: 28px 16px 64px;
  }
  .ie-reader {
    background: var(--reader-paper);
    border: 1px solid var(--reader-rule);
    border-radius: 2px;
    padding: 2.25rem 2rem 2.75rem;
    box-shadow: 0 1px 0 rgba(255,255,255,.7) inset, 0 10px 28px rgba(28, 40, 55, .08);
  }
  .ie-reader-kicker {
    margin: 0 0 0.85rem;
    font-family: "Geneva-12", "Lucida Grande", Geneva, Helvetica, Arial, sans-serif;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--reader-accent);
  }
  .ie-reader h1 {
    margin: 0 0 0.65rem;
    font-family: "AppleGaramond", "EB Garamond", Georgia, serif;
    font-size: clamp(1.85rem, 4vw, 2.35rem);
    font-weight: normal;
    line-height: 1.18;
    letter-spacing: -0.01em;
    color: var(--reader-ink);
  }
  .ie-reader-byline {
    margin: 0 0 1.1rem;
    font-family: "Geneva-12", "Lucida Grande", Geneva, Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: var(--reader-muted);
  }
  .ie-reader-dek {
    margin: 0 0 1.5rem;
    padding-bottom: 1.35rem;
    border-bottom: 1px solid var(--reader-rule);
    font-size: 1.15rem;
    line-height: 1.45;
    color: #3a4550;
    font-style: italic;
  }
  .ie-reader-hero {
    margin: 0 0 1.5rem;
    border: 1px solid var(--reader-rule);
    background: #eef2f6;
    overflow: hidden;
  }
  .ie-reader-hero img {
    display: block;
    width: 100%;
    height: auto;
    vertical-align: middle;
  }
  .ie-reader-body {
    font-size: 1.125rem;
    line-height: 1.7;
  }
  .ie-reader-body p,
  .ie-reader-body li,
  .ie-reader-body blockquote {
    margin: 0 0 1.05rem;
  }
  .ie-reader-body h2,
  .ie-reader-body h3,
  .ie-reader-body h4 {
    font-family: "AppleGaramond", "EB Garamond", Georgia, serif;
    font-weight: normal;
    line-height: 1.25;
    margin: 1.6rem 0 0.7rem;
  }
  .ie-reader-body h2 { font-size: 1.45rem; }
  .ie-reader-body h3 { font-size: 1.25rem; }
  .ie-reader-body a { color: var(--reader-link); }
  .ie-reader-body img {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 1.25rem 0;
    border: 1px solid var(--reader-rule);
  }
  .ie-reader-body blockquote {
    margin: 1.25rem 0;
    padding: 0.15rem 0 0.15rem 1rem;
    border-left: 3px solid var(--reader-accent);
    color: #33404c;
    font-style: italic;
  }
  .ie-reader-body ul,
  .ie-reader-body ol {
    margin: 0 0 1.05rem;
    padding-left: 1.35rem;
  }
  .ie-reader-truncated {
    margin-top: 1.5rem;
    color: var(--reader-muted);
    font-size: 0.95rem;
  }
  @media (max-width: 640px) {
    .ie-reader { padding: 1.5rem 1.15rem 2rem; }
    .ie-reader-bar { padding: 9px 12px; gap: 8px; flex-wrap: wrap; }
  }
</style>
</head>
<body>
  <header class="ie-reader-bar">
    <div><strong>Reader</strong> · ${safeHost}</div>
    <div><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open original</a></div>
  </header>
  <div class="ie-reader-shell">
    <article class="ie-reader">
      <p class="ie-reader-kicker">Simplified for Internet Explorer</p>
      ${
        safeHero
          ? `<figure class="ie-reader-hero"><img src="${safeHero}" alt=""></figure>`
          : ""
      }
      <h1>${safeTitle}</h1>
      ${safeByline ? `<p class="ie-reader-byline">${safeByline}</p>` : ""}
      ${safeDescription ? `<p class="ie-reader-dek">${safeDescription}</p>` : ""}
      <div class="ie-reader-body">
        ${body}
      </div>
    </article>
  </div>
</body>
</html>`;
}

export interface SanitizeProxiedHtmlResult {
  html: string;
  strippedScripts: boolean;
  liteMode: boolean;
  byteLength: number;
}

/**
 * Cap + convert oversized HTML into a lite/reader view so the shared tab stays
 * responsive. Throws IeHtmlTooLargeError when over the hard ceiling.
 */
export async function sanitizeProxiedHtml(
  html: string,
  options?: {
    maxBytes?: number;
    liteThresholdBytes?: number;
    scriptStripThresholdBytes?: number;
    pageUrl?: string;
  }
): Promise<SanitizeProxiedHtmlResult> {
  const maxBytes = options?.maxBytes ?? IE_MAX_HTML_BYTES;
  const liteThreshold =
    options?.liteThresholdBytes ??
    options?.scriptStripThresholdBytes ??
    IE_LITE_THRESHOLD_BYTES;
  const pageUrl = options?.pageUrl || "about:blank";

  // Approximate wire size with UTF-8 byte length of the string we already hold.
  const byteLength = new TextEncoder().encode(html).byteLength;
  if (byteLength > maxBytes) {
    throw new IeHtmlTooLargeError(byteLength, maxBytes);
  }

  if (byteLength > liteThreshold) {
    return {
      html: await buildLiteHtml(html, pageUrl),
      strippedScripts: true,
      liteMode: true,
      byteLength,
    };
  }

  return { html, strippedScripts: false, liteMode: false, byteLength };
}
