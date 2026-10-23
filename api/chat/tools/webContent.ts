/**
 * Turn a fetched response body into text for the webFetch tool.
 * Security limits (SSRF, redirects, timeout) stay in the executor.
 */

import {
  extractMetadata,
  findAlternateFeedUrl,
  stripHtmlToText,
  visibleTextLength,
} from "./htmlExtract.js";
import {
  extractXmlDocument,
  isJsonFeedDocument,
  parseJsonFeed,
  renderFeed,
  renderMatchedFeedItem,
  findFeedItem,
} from "./feedExtract.js";
import {
  capContent,
  WEB_FETCH_MAX_CONTENT_CHARS,
  WEB_FETCH_MAX_DOWNLOAD_BYTES,
  WEB_FETCH_THIN_PAGE_CHARS,
  WEB_FETCH_TRUNCATION_NOTE,
} from "./webContentLimits.js";

export {
  WEB_FETCH_MAX_CONTENT_CHARS,
  WEB_FETCH_MAX_DOWNLOAD_BYTES,
  WEB_FETCH_THIN_PAGE_CHARS,
  WEB_FETCH_TRUNCATION_NOTE,
};

export type WebContentKind = "html" | "json" | "feed" | "text" | "xml" | "unsupported";

export interface ExtractedWebDocument {
  kind: WebContentKind;
  content: string;
  title?: string;
  description?: string;
  siteName?: string;
  truncated: boolean;
  /** Length before the output cap. */
  contentLength: number;
  visibleLength: number;
  alternateFeedUrl?: string;
  feedItemCount?: number;
  matchedFeedItem?: boolean;
}

export interface ExtractWebDocumentOptions {
  selector?: string;
  pageUrl?: string;
  /** When set, a feed body returns only the item for this page. */
  matchUrl?: string;
  maxChars?: number;
}

export function mediaTypeOf(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() || "";
}

export function classifyContentType(contentType: string): WebContentKind | "sniff" {
  const mime = mediaTypeOf(contentType);
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (
    mime === "application/rss+xml" ||
    mime === "application/atom+xml" ||
    mime === "application/rdf+xml" ||
    mime === "application/xml" ||
    mime === "text/xml" ||
    mime === "application/feed+xml"
  ) {
    return "xml";
  }
  if (
    mime === "application/json" ||
    mime === "application/feed+json" ||
    mime === "text/json" ||
    mime.endsWith("+json")
  ) {
    return "json";
  }
  if (mime.startsWith("text/")) return "text";
  if (!mime || mime === "application/octet-stream" || mime === "binary/octet-stream") {
    return "sniff";
  }
  return "unsupported";
}

function sniffKind(body: string): WebContentKind {
  const sample = body.slice(0, 512);
  if (sample.includes("\0")) return "unsupported";
  const head = sample.trimStart().slice(0, 240).toLowerCase();
  if (
    head.startsWith("<!doctype html") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.startsWith("<body")
  ) {
    return "html";
  }
  if (
    head.startsWith("<?xml") ||
    head.startsWith("<rss") ||
    head.startsWith("<feed") ||
    head.startsWith("<rdf")
  ) {
    return "xml";
  }
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  let printable = 0;
  const length = Math.min(sample.length, 256);
  for (let i = 0; i < length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 0xfffd)) {
      printable += 1;
    }
  }
  if (length === 0 || printable / length > 0.9) return "text";
  return "unsupported";
}

function withVisible(
  doc: Omit<ExtractedWebDocument, "visibleLength"> & { visibleLength?: number }
): ExtractedWebDocument {
  return {
    ...doc,
    visibleLength: doc.visibleLength ?? visibleTextLength(doc.content),
  };
}

function extractHtml(
  body: string,
  options: ExtractWebDocumentOptions,
  maxChars: number
): ExtractedWebDocument {
  const content = stripHtmlToText(body, options.selector, options.pageUrl);
  const meta = extractMetadata(body);
  const capped = capContent(content, maxChars);
  const visibleLength = visibleTextLength(content);
  const alternateFeedUrl =
    !options.selector?.trim() &&
    options.pageUrl &&
    visibleLength < WEB_FETCH_THIN_PAGE_CHARS
      ? findAlternateFeedUrl(body, options.pageUrl)
      : undefined;
  return {
    kind: "html",
    content: capped.content,
    title: meta.title,
    description: meta.description,
    siteName: meta.siteName,
    truncated: capped.truncated,
    contentLength: capped.contentLength,
    visibleLength,
    alternateFeedUrl,
  };
}

function extractJson(
  body: string,
  contentType: string,
  options: ExtractWebDocumentOptions,
  maxChars: number
): ExtractedWebDocument {
  const mime = mediaTypeOf(contentType);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }
  const forceFeed = mime === "application/feed+json";
  if (parsed !== undefined && isJsonFeedDocument(parsed, forceFeed)) {
    const feed = parseJsonFeed(parsed);
    if (feed) {
      if (options.matchUrl) {
        const item = findFeedItem(feed, options.matchUrl);
        if (item) {
          const rendered = renderMatchedFeedItem(feed, item);
          const capped = capContent(rendered, maxChars);
          return withVisible({
            kind: "feed",
            content: capped.content,
            title: item.title || feed.title || undefined,
            description: feed.description,
            siteName: feed.title || undefined,
            truncated: capped.truncated,
            contentLength: capped.contentLength,
            feedItemCount: feed.items.length,
            matchedFeedItem: true,
          });
        }
        return withVisible({
          kind: "feed",
          content: "",
          title: feed.title || undefined,
          siteName: feed.title || undefined,
          truncated: false,
          contentLength: 0,
          feedItemCount: feed.items.length,
          matchedFeedItem: false,
        });
      }
      const rendered = renderFeed(feed, maxChars);
      return withVisible({
        kind: "feed",
        content: rendered.text,
        title: feed.title || undefined,
        description: feed.description,
        siteName: feed.title || undefined,
        truncated: rendered.truncated,
        contentLength: rendered.contentLength,
        feedItemCount: feed.items.length,
        matchedFeedItem: false,
      });
    }
  }

  const capped = capContent(body.trim(), maxChars);
  return withVisible({
    kind: "json",
    content: capped.content,
    truncated: capped.truncated,
    contentLength: capped.contentLength,
  });
}

export function extractWebDocument(
  body: string,
  contentType: string,
  options: ExtractWebDocumentOptions = {}
): ExtractedWebDocument {
  const maxChars = options.maxChars ?? WEB_FETCH_MAX_CONTENT_CHARS;
  let kind = classifyContentType(contentType);
  if (kind === "sniff") kind = sniffKind(body);
  if (kind === "unsupported") {
    return {
      kind: "unsupported",
      content: "",
      truncated: false,
      contentLength: 0,
      visibleLength: 0,
    };
  }
  if (kind === "html") return extractHtml(body, options, maxChars);
  if (kind === "xml") {
    const extracted = extractXmlDocument(body, maxChars, options.matchUrl);
    return withVisible(extracted);
  }
  if (kind === "json") return extractJson(body, contentType, options, maxChars);
  const capped = capContent(body.trim(), maxChars);
  return withVisible({
    kind: "text",
    content: capped.content,
    truncated: capped.truncated,
    contentLength: capped.contentLength,
  });
}

function charsetOf(contentType: string | null): string {
  const match = contentType?.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
  return match?.[1]?.trim() || "utf-8";
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

/** Read a response body, stopping at maxBytes so a huge payload cannot land in memory. */
export async function readResponseTextLimited(
  response: Response,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  const charset = charsetOf(response.headers.get("content-type"));
  const reader = response.body?.getReader();
  if (!reader) {
    const encoded = new TextEncoder().encode(await response.text());
    const truncated = encoded.byteLength > maxBytes;
    const slice = truncated ? encoded.subarray(0, maxBytes) : encoded;
    return { text: decodeBytes(slice, charset), truncated };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    if (received + value.byteLength > maxBytes) {
      const room = maxBytes - received;
      if (room > 0) chunks.push(value.subarray(0, room));
      truncated = true;
      received = maxBytes;
      try {
        await reader.cancel();
      } catch {
        // The body may already be closed.
      }
      break;
    }
    chunks.push(value);
    received += value.byteLength;
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: decodeBytes(merged, charset), truncated };
}
