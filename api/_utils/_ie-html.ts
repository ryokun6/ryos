/**
 * Helpers for keeping Internet Explorer proxied HTML bounded so a single
 * oversized modern page cannot freeze the shared browser tab (ryOS desktop).
 *
 * Proxied pages are same-origin to the shell, so their scripts share the main
 * thread. Cap body size and strip third-party scripts on large documents.
 */

/** Hard ceiling for buffered HTML. Above this we refuse to embed the page. */
export const IE_MAX_HTML_BYTES = 2_500_000;

/**
 * When HTML exceeds this size, strip page `<script>` tags before embedding.
 * Our own navigation interceptor is re-injected after stripping.
 */
export const IE_SCRIPT_STRIP_THRESHOLD_BYTES = 350_000;

/** How much of an HTML body to scan for `<title>` / meta CSP in check mode. */
export const IE_HTML_HEAD_SCAN_BYTES = 64_000;

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

/** Remove page `<script>` tags. Caller re-injects the IE navigation interceptor. */
export function stripHtmlScripts(html: string): string {
  return html.replace(SCRIPT_TAG_RE, "").replace(SCRIPT_SELF_CLOSING_RE, "");
}

export interface SanitizeProxiedHtmlResult {
  html: string;
  strippedScripts: boolean;
  byteLength: number;
}

/**
 * Cap + optionally strip scripts on proxied HTML so the shared tab stays
 * responsive. Throws IeHtmlTooLargeError when over the hard ceiling.
 */
export function sanitizeProxiedHtml(
  html: string,
  options?: {
    maxBytes?: number;
    scriptStripThresholdBytes?: number;
  }
): SanitizeProxiedHtmlResult {
  const maxBytes = options?.maxBytes ?? IE_MAX_HTML_BYTES;
  const scriptStripThreshold =
    options?.scriptStripThresholdBytes ?? IE_SCRIPT_STRIP_THRESHOLD_BYTES;

  // Approximate wire size with UTF-8 byte length of the string we already hold.
  const byteLength = new TextEncoder().encode(html).byteLength;
  if (byteLength > maxBytes) {
    throw new IeHtmlTooLargeError(byteLength, maxBytes);
  }

  if (byteLength > scriptStripThreshold) {
    return {
      html: stripHtmlScripts(html),
      strippedScripts: true,
      byteLength,
    };
  }

  return { html, strippedScripts: false, byteLength };
}
