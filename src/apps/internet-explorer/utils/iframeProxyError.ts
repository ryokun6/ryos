import type { ErrorResponse } from "@/stores/useInternetExplorerStore";

/** Client-side ceiling for iframe navigations (proxy / passthrough). */
export const IE_IFRAME_NAVIGATION_TIMEOUT_MS = 25_000;

/**
 * Detect JSON error payloads returned by `/api/iframe-check` without walking
 * the entire DOM via `body.textContent` (which freezes on multi‑MB pages).
 *
 * Proxy errors are served as `application/json` with a tiny body. Real HTML
 * pages must never take the textContent path.
 */
export function readIframeProxyError(
  doc: Document | null | undefined
): ErrorResponse | null {
  if (!doc) return null;

  const contentType = (doc.contentType || "").toLowerCase();
  const isJsonContentType =
    contentType.includes("application/json") ||
    contentType.includes("text/json");

  // Fast path: HTML documents are never proxy JSON errors.
  if (contentType.includes("html") && !isJsonContentType) {
    return null;
  }

  const body = doc.body;
  if (!body) return null;

  // JSON error documents are a single text node (no element children).
  // Skip anything that looks like a real page DOM.
  if (body.childElementCount > 0) {
    return null;
  }

  const text = body.textContent?.trim();
  if (!text) return null;

  if (!isJsonContentType) {
    // Unknown / empty content-type: only attempt parse if the body is a
    // small JSON-looking blob (proxy errors are a few hundred bytes).
    if (text.length > 4_000) return null;
    if (!(text.startsWith("{") || text.startsWith("["))) return null;
  }

  try {
    const parsed = JSON.parse(text) as ErrorResponse;
    if (parsed && parsed.error === true && typeof parsed.type === "string") {
      return parsed;
    }
  } catch {
    // Not JSON — treat as a normal page.
  }

  return null;
}
