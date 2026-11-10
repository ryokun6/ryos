/**
 * Helpers for keeping Internet Explorer proxied HTML bounded so a single
 * oversized modern page cannot freeze the shared browser tab (ryOS desktop).
 *
 * Proxied pages share the shell's main thread. Cap body size and, for
 * oversized documents, serve a lite/reader view instead of the full page.
 *
 * Unless the proxy runs on an isolated origin (`IE_PROXY_ORIGIN`), upstream
 * scripts, event handlers and `javascript:` URLs are stripped from every
 * proxied document (`stripActiveHtml`).
 */

import { decodeHtmlEntitiesOnce } from "./html-entities.js";
import {
  extractTitleText,
  findCloseTag,
  findOpenTag,
  readTagAttr,
} from "./_html-linear.js";

/** Hard ceiling for buffered HTML. Above this we refuse to embed the page. */
export const IE_MAX_HTML_BYTES = 2_500_000;

/**
 * When HTML exceeds this size, serve a lite/reader view (extracted article
 * content) instead of the full document. Our navigation interceptor is still
 * injected afterward by the proxy.
 *
 * ~1 MB leaves ordinary modern pages as a full proxy; the freeze cases we care
 * about (e.g. heavy magazine HTML + script bundles) are typically well above
 * this. Hard refuse remains at IE_MAX_HTML_BYTES.
 */
export const IE_LITE_THRESHOLD_BYTES = 1_000_000;

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

/** Max open-tag candidates tried by extractBalancedInner before giving up. */
const EXTRACT_BALANCED_MAX_OPENS = 64;

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

/** Elements that can run script or embed active content. */
const ACTIVE_CONTENT_TAGS = new Set([
  "script",
  "object",
  "embed",
  "applet",
  "base",
  "portal",
]);

/** `<meta http-equiv>` values the proxy must not let through. */
const BLOCKED_META_HTTP_EQUIV = new Set([
  "refresh",
  "set-cookie",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
]);

/** Attributes whose value is a URL that the browser may navigate to or run. */
const URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "data",
  "poster",
  "background",
  "lowsrc",
  "dynsrc",
  "ping",
  "codebase",
  "cite",
  "longdesc",
  "manifest",
  "icon",
]);

/** Elements or attributes where a `data:` document would be rendered. */
const DOCUMENT_URL_ATTRIBUTES = new Set(["href", "action", "formaction", "xlink:href"]);
const DOCUMENT_FRAME_TAGS = new Set(["iframe", "frame"]);
const ACTIVE_DATA_TYPE_RE =
  /^data:(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/;

function normalizeUrlForSchemeCheck(raw: string): string {
  return raw
    .replace(/&colon;?/gi, ":")
    .replace(/&(?:tab|newline);?/gi, "")
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) =>
      String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff))
    )
    .replace(/&#(\d+);?/g, (_m, dec: string) =>
      String.fromCodePoint(Math.min(parseInt(dec, 10), 0x10ffff))
    )
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
    .toLowerCase();
}

export function isDangerousUrlAttribute(
  tagName: string,
  attributeName: string,
  value: string
): boolean {
  const normalized = normalizeUrlForSchemeCheck(decodeHtmlEntitiesOnce(value));
  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/)?.[1];
  if (!scheme) return false;
  if (scheme.includes("script")) return true;
  if (scheme === "data") {
    return (
      (DOCUMENT_URL_ATTRIBUTES.has(attributeName) ||
        DOCUMENT_FRAME_TAGS.has(tagName)) &&
      ACTIVE_DATA_TYPE_RE.test(normalized)
    );
  }
  return false;
}

export interface StripActiveHtmlResult {
  html: string;
  /** Number of elements / attributes removed. */
  removed: number;
}

/**
 * Remove everything in a proxied document that could execute script:
 * `<script>` and plugin elements, inline `on*` handlers, `javascript:` /
 * `vbscript:` URLs, `data:` documents in navigable attributes, `srcdoc`,
 * SVG href animations, and blocking `<meta http-equiv>` tags.
 *
 * `<noscript>` is unwrapped first (its content is raw text to the parser
 * until then) so fallback markup shows and is sanitized like the rest.
 */
export function stripActiveHtml(html: string): StripActiveHtmlResult {
  let removed = 0;
  const unwrapped = rewriteHtml(html, (rewriter) =>
    rewriter.on("noscript", {
      element(el) {
        el.removeAndKeepContent();
      },
    })
  );

  const sanitized = rewriteHtml(unwrapped, (rewriter) =>
    rewriter.on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (ACTIVE_CONTENT_TAGS.has(tag)) {
          el.remove();
          removed += 1;
          return;
        }
        if (tag === "meta") {
          const httpEquiv = (el.getAttribute("http-equiv") || "").trim().toLowerCase();
          if (BLOCKED_META_HTTP_EQUIV.has(httpEquiv)) {
            el.remove();
            removed += 1;
            return;
          }
        }
        if (tag === "animate" || tag === "set" || tag === "animatetransform") {
          const target = (el.getAttribute("attributeName") || "").toLowerCase();
          if (target.includes("href")) {
            el.remove();
            removed += 1;
            return;
          }
        }

        const attributes: Array<[string, string]> = [];
        for (const [name, value] of el.attributes) {
          attributes.push([name, value]);
        }
        for (const [name, value] of attributes) {
          const lower = name.toLowerCase();
          if (
            lower.startsWith("on") ||
            lower === "srcdoc" ||
            (URL_ATTRIBUTES.has(lower) && isDangerousUrlAttribute(tag, lower, value)) ||
            ((lower === "values" || lower === "to" || lower === "from") &&
              /script:/i.test(normalizeUrlForSchemeCheck(value)))
          ) {
            el.removeAttribute(name);
            removed += 1;
          }
        }
      },
    })
  );

  return { html: sanitized, removed };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(html: string): string {
  // Linear tag strip — bare `<` without `>` must not restart an O(n) scan.
  let pos = 0;
  let out = "";
  while (pos < html.length) {
    const lt = html.indexOf("<", pos);
    if (lt < 0) {
      out += html.slice(pos);
      break;
    }
    out += html.slice(pos, lt);
    const gt = html.indexOf(">", lt + 1);
    if (gt < 0) {
      out += " ";
      break;
    }
    out += " ";
    pos = gt + 1;
  }
  return decodeHtmlEntitiesOnce(out.replace(/\s+/g, " ").trim());
}

function metaContent(html: string, names: string[]): string | null {
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  // Metadata lives in <head>; bound the scan like check-mode does.
  const window =
    html.length > IE_HTML_HEAD_SCAN_BYTES
      ? html.slice(0, IE_HTML_HEAD_SCAN_BYTES)
      : html;
  let pos = 0;
  let guard = 0;
  while (guard++ < 2_000) {
    const open = findOpenTag(window, "meta", pos);
    if (!open) break;
    pos = open.end;
    const property = (readTagAttr(open.tag, "property") || "").toLowerCase();
    const name = (readTagAttr(open.tag, "name") || "").toLowerCase();
    if (!wanted.has(property) && !wanted.has(name)) continue;
    const content = readTagAttr(open.tag, "content");
    if (content) return decodeHtmlEntitiesOnce(content.trim());
  }
  return null;
}

function extractTitle(html: string): string {
  // Prefer the on-page headline for reader mode when present.
  const h1Open = findOpenTag(html, "h1", 0);
  if (h1Open) {
    const h1Close = findCloseTag(html, "h1", h1Open.end);
    if (h1Close) {
      const h1 = stripTags(html.slice(h1Open.end, h1Close.start));
      if (h1.length >= 8) return h1;
    }
  }
  const og = metaContent(html, ["og:title", "twitter:title"]);
  if (og) return og;
  const titleInner = extractTitleText(html, IE_HTML_HEAD_SCAN_BYTES);
  if (titleInner) return decodeHtmlEntitiesOnce(titleInner.trim());
  return "Untitled page";
}

/**
 * Extract the inner HTML of the first balanced match for `tagName`, optionally
 * requiring a predicate on the opening tag attributes.
 *
 * Scans forward with `indexOf` so an unclosed opener cannot restart an O(n)
 * walk of the remainder from every candidate (that was O(n²) on crafted HTML).
 * After the first matching opener that fails to balance, we stop.
 */
function extractBalancedInner(
  html: string,
  tagName: string,
  openTagPredicate?: (openTag: string) => boolean
): string | null {
  const lowerName = tagName.toLowerCase();
  let searchFrom = 0;
  let opensTried = 0;

  while (opensTried < EXTRACT_BALANCED_MAX_OPENS) {
    const open = findOpenTag(html, tagName, searchFrom);
    if (!open) return null;
    searchFrom = open.end;
    if (openTagPredicate && !openTagPredicate(open.tag)) continue;
    opensTried += 1;

    const start = open.end;
    let depth = 1;
    let pos = start;
    let balanced = false;
    let innerEnd = -1;

    while (pos < html.length) {
      const nextLt = html.indexOf("<", pos);
      if (nextLt < 0) break;
      const nextGt = html.indexOf(">", nextLt + 1);
      if (nextGt < 0) break;
      const raw = html.slice(nextLt, nextGt + 1);
      const isClose = raw.startsWith("</");
      const nameStart = nextLt + (isClose ? 2 : 1);
      const nameMatch = /^[a-zA-Z0-9:-]+/.exec(html.slice(nameStart, nextGt));
      const name = nameMatch?.[0]?.toLowerCase();
      pos = nextGt + 1;
      if (name !== lowerName) continue;
      const isSelfClosing = !isClose && /\/\s*>$/.test(raw);
      if (isClose) depth -= 1;
      else if (!isSelfClosing) depth += 1;
      if (depth === 0) {
        balanced = true;
        innerEnd = nextLt;
        break;
      }
    }

    if (balanced) return html.slice(start, innerEnd);
    // First matching opener never balanced — stop (do not O(n²) retry).
    return null;
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
  const tags = ["p", "h2", "h3", "blockquote"] as const;
  // Walk the document once, picking the earliest next block of any type.
  let pos = 0;
  while (parts.join("").length <= IE_LITE_CONTENT_MAX_BYTES) {
    let best: { start: number; end: number; tag: string } | null = null;
    for (const tag of tags) {
      const open = findOpenTag(html, tag, pos);
      if (!open) continue;
      if (!best || open.start < best.start) {
        best = { start: open.start, end: open.end, tag };
      }
    }
    if (!best) break;
    const close = findCloseTag(html, best.tag, best.end);
    if (!close) {
      // Unclosed block — skip past this opener and continue linearly.
      pos = best.end;
      continue;
    }
    const block = html.slice(best.start, close.end);
    pos = close.end;
    const text = stripTags(block);
    if (text.length < 50) continue;
    if (isBoilerplateParagraph(text)) continue;
    parts.push(block);
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
    <div>${safeHost}</div>
    <div><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open original</a></div>
  </header>
  <div class="ie-reader-shell">
    <article class="ie-reader">
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
 * responsive, and strip all active content (scripts, inline handlers,
 * `javascript:` URLs) unless the caller serves the document from an isolated
 * proxy origin (`keepScripts`). Throws IeHtmlTooLargeError when over the hard
 * ceiling.
 */
export async function sanitizeProxiedHtml(
  html: string,
  options?: {
    maxBytes?: number;
    liteThresholdBytes?: number;
    scriptStripThresholdBytes?: number;
    pageUrl?: string;
    keepScripts?: boolean;
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
      html: stripActiveHtml(await buildLiteHtml(html, pageUrl)).html,
      strippedScripts: true,
      liteMode: true,
      byteLength,
    };
  }

  if (options?.keepScripts) {
    return { html, strippedScripts: false, liteMode: false, byteLength };
  }

  const stripped = stripActiveHtml(html);
  return {
    html: stripped.html,
    strippedScripts: stripped.removed > 0,
    liteMode: false,
    byteLength,
  };
}
