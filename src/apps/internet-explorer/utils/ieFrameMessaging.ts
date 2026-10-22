import type { ErrorResponse } from "@/stores/useInternetExplorerStore";

/**
 * Sandbox for IE iframes that render proxied (`/api/iframe-check`) content.
 * Never includes `allow-same-origin`: proxied pages must not run with the
 * ryOS origin. The proxy also sends a matching CSP `sandbox` header.
 */
export const IE_PROXY_IFRAME_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-pointer-lock";

const IE_DIRECT_IFRAME_SANDBOX = `${IE_PROXY_IFRAME_SANDBOX} allow-same-origin`;

/**
 * Pick the sandbox for an IE iframe `src`. Direct embeds of other sites keep
 * `allow-same-origin` (it only grants them their own origin, which they have
 * in any normal iframe). Anything served from this app's `/api/` — the proxy
 * in particular — stays opaque.
 */
export function getIeIframeSandbox(
  src: string | null | undefined,
  appOrigin: string = typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost"
): string {
  if (!src) return IE_PROXY_IFRAME_SANDBOX;
  let parsed: URL;
  try {
    parsed = new URL(src, appOrigin);
  } catch {
    return IE_PROXY_IFRAME_SANDBOX;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return IE_PROXY_IFRAME_SANDBOX;
  }
  if (parsed.origin === appOrigin && parsed.pathname.startsWith("/api/")) {
    return IE_PROXY_IFRAME_SANDBOX;
  }
  return IE_DIRECT_IFRAME_SANDBOX;
}

/** Random per-IE-window token; the proxy echoes it back in postMessages. */
export function createIeFrameInstanceToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildIeFrameId(instanceToken: string, navToken: number): string {
  return `${instanceToken}.${navToken}`;
}

/** Add `ieFrame=<instance>.<nav>` to proxy URLs; other URLs are unchanged. */
export function withIeFrameId(
  url: string,
  instanceToken: string,
  navToken: number
): string {
  if (!url.startsWith("/api/iframe-check")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ieFrame=${encodeURIComponent(
    buildIeFrameId(instanceToken, navToken)
  )}`;
}

export type IeFrameReport =
  | { kind: "loaded"; title: string | null; blankSpa: boolean }
  | { kind: "error"; error: ErrorResponse };

export type IeFrameMessage =
  | { type: "iframeNavigation"; url: string }
  | { type: "iframeOpenWindow"; url: string }
  | { type: "goBack" }
  | { type: "iframeLoaded"; title: string | null; blankSpa: boolean }
  | { type: "iframeProxyError"; error: ErrorResponse };

/**
 * Validate a message from the IE content iframe. The proxied document has an
 * opaque origin (or the isolated proxy origin), so `event.origin` cannot
 * identify it; instead the sender must be our iframe's window and must echo
 * the frame id we put in its URL for the current navigation.
 */
export function parseIeFrameMessage(
  event: Pick<MessageEvent, "data" | "source">,
  iframeWindow: Window | null | undefined,
  expectedFrameId: string
): IeFrameMessage | null {
  if (!iframeWindow || event.source !== iframeWindow) return null;
  const data = event.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return null;
  if (data.ieFrame !== expectedFrameId) return null;

  switch (data.type) {
    case "iframeNavigation":
    case "iframeOpenWindow":
      return typeof data.url === "string" && /^https?:\/\//i.test(data.url)
        ? { type: data.type, url: data.url }
        : null;
    case "goBack":
      return { type: "goBack" };
    case "iframeLoaded":
      return {
        type: "iframeLoaded",
        title:
          typeof data.title === "string" && data.title.trim()
            ? data.title.slice(0, 500)
            : null,
        blankSpa: data.blankSpa === true,
      };
    case "iframeProxyError": {
      const error = data.error as Record<string, unknown> | null | undefined;
      if (!error || error.error !== true || typeof error.type !== "string") {
        return null;
      }
      return {
        type: "iframeProxyError",
        error: {
          error: true,
          type: error.type,
          status: typeof error.status === "number" ? error.status : undefined,
          message: typeof error.message === "string" ? error.message : "",
          statusText:
            typeof error.statusText === "string" ? error.statusText : undefined,
          details: typeof error.details === "string" ? error.details : undefined,
        },
      };
    }
    default:
      return null;
  }
}
