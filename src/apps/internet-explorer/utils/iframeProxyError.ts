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

const CLIENT_SPA_ROOT_IDS = ["root", "app", "__next"];
const BLANK_SPA_TEXT_LIMIT = 80;

/**
 * Detect a client-rendered SPA shell that hydrated without matching a route.
 *
 * ryo.lu (CRA + BrowserRouter) is the motivating case: under
 * `/api/iframe-check` the pathname is `/api/iframe-check`, no route matches,
 * and `#root` keeps only chrome (e.g. PeekUnder's page-curl) — a silent
 * blank instead of an IE error page.
 */
export function isBlankClientSpaDocument(
  doc: Document | null | undefined
): boolean {
  if (!doc?.body) return false;

  let root: Element | null = null;
  for (const id of CLIENT_SPA_ROOT_IDS) {
    root = doc.getElementById(id);
    if (root) break;
  }
  if (!root) return false;

  if (root.querySelector("h1, h2, article, main, header.big")) {
    return false;
  }

  const text = (root.textContent || "").replace(/\s+/g, " ").trim();
  return text.length <= BLANK_SPA_TEXT_LIMIT;
}
