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

const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SCRIPT_SELF_CLOSING_RE = /<script\b[^>]*\/>/gi;
const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const NOSCRIPT_TAG_RE = /<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi;
const SVG_TAG_RE = /<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi;
const IFRAME_TAG_RE = /<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TAG_RE = /<\/?([a-zA-Z0-9:-]+)(\s[^>]*)?>/g;

/** Remove page `<script>` tags. Caller re-injects the IE navigation interceptor. */
export function stripHtmlScripts(html: string): string {
  return html.replace(SCRIPT_TAG_RE, "").replace(SCRIPT_SELF_CLOSING_RE, "");
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
  const og = metaContent(html, ["og:title", "twitter:title"]);
  if (og) return og;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) return decodeHtmlEntitiesOnce(titleMatch[1].trim());
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) return stripTags(h1Match[1]);
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

function cleanExtractedMarkup(html: string): string {
  return html
    .replace(COMMENT_RE, "")
    .replace(SCRIPT_TAG_RE, "")
    .replace(SCRIPT_SELF_CLOSING_RE, "")
    .replace(STYLE_TAG_RE, "")
    .replace(NOSCRIPT_TAG_RE, "")
    .replace(SVG_TAG_RE, "")
    .replace(IFRAME_TAG_RE, "")
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\s(style)\s*=\s*(['"])[\s\S]*?\2/gi, "")
    .trim();
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
  return `${text}\n<p><em>…content truncated for performance.</em></p>`;
}

function collectFallbackBlocks(html: string): string {
  const parts: string[] = [];
  const h1 = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  if (h1) parts.push(h1[0]);

  const paragraphRe = /<(p|h2|h3|blockquote|li)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraphRe.exec(html))) {
    const text = stripTags(match[0]);
    if (text.length < 40) continue;
    parts.push(match[0]);
    if (parts.join("").length > IE_LITE_CONTENT_MAX_BYTES) break;
  }

  const images: string[] = [];
  const ogImage = metaContent(html, ["og:image", "twitter:image"]);
  if (ogImage) {
    images.push(
      `<p><img src="${escapeHtml(ogImage)}" alt="" style="max-width:100%;height:auto"></p>`
    );
  }
  const imgRe = /<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgRe.exec(html)) && images.length < 4) {
    const src = imgMatch[1];
    if (!src || src.startsWith("data:")) continue;
    if (ogImage && src === ogImage) continue;
    images.push(
      `<p><img src="${escapeHtml(src)}" alt="" style="max-width:100%;height:auto"></p>`
    );
  }

  return [...images.slice(0, 1), ...parts, ...images.slice(1)].join("\n");
}

/**
 * Build a lightweight reader document from a heavy page so IE can show the
 * content without parsing/executing the full modern site bundle.
 */
export function buildLiteHtml(html: string, pageUrl: string): string {
  const title = extractTitle(html);
  const description =
    metaContent(html, ["og:description", "description", "twitter:description"]) ||
    "";

  let body =
    extractBalancedInner(html, "article") ||
    extractBalancedInner(
      html,
      "main",
      (open) => /role\s*=\s*["']?main["']?/i.test(open) || true
    ) ||
    extractBalancedInner(html, "div", (open) =>
      /role\s*=\s*["']main["']/i.test(open)
    ) ||
    extractBalancedInner(html, "div", (open) =>
      /class\s*=\s*["'][^"']*(?:article-body|article__body|post-content|entry-content|page-content|content-body)[^"']*["']/i.test(
        open
      )
    );

  if (body) {
    body = cleanExtractedMarkup(body);
  }
  if (!body || stripTags(body).length < 120) {
    body = cleanExtractedMarkup(collectFallbackBlocks(html));
  }

  body = truncateHtml(body, IE_LITE_CONTENT_MAX_BYTES);

  const safeTitle = escapeHtml(title);
  const safeDescription = description ? escapeHtml(description) : "";
  const safeUrl = escapeHtml(pageUrl);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<meta name="page-title" content="${encodeURIComponent(title)}">
<meta name="ie-lite-view" content="1">
<style>
  body{margin:0;padding:24px;font:16px/1.55 Geneva,Helvetica,Arial,sans-serif;color:#111;background:#f7f7f7}
  .ie-lite{max-width:44rem;margin:0 auto;background:#fff;border:1px solid #ccc;padding:20px 24px 32px}
  .ie-lite-banner{margin:0 0 1.25rem;padding:.75rem 1rem;background:#fff8d5;border:1px solid #e2c96a;font-size:13px;line-height:1.4}
  .ie-lite-banner a{color:#0b57d0}
  h1{font-size:1.6rem;line-height:1.25;margin:0 0 .75rem}
  .ie-lite-desc{color:#444;margin:0 0 1.25rem}
  img{max-width:100%;height:auto}
  p,li,blockquote{margin:0 0 .9rem}
  a{color:#0b57d0}
</style>
</head>
<body>
<main class="ie-lite">
  <p class="ie-lite-banner">
    Simplified view — this page was too large to load fully in Internet Explorer.
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open original</a>
  </p>
  <h1>${safeTitle}</h1>
  ${safeDescription ? `<p class="ie-lite-desc">${safeDescription}</p>` : ""}
  ${body}
</main>
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
export function sanitizeProxiedHtml(
  html: string,
  options?: {
    maxBytes?: number;
    liteThresholdBytes?: number;
    scriptStripThresholdBytes?: number;
    pageUrl?: string;
  }
): SanitizeProxiedHtmlResult {
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
      html: buildLiteHtml(html, pageUrl),
      strippedScripts: true,
      liteMode: true,
      byteLength,
    };
  }

  return { html, strippedScripts: false, liteMode: false, byteLength };
}
