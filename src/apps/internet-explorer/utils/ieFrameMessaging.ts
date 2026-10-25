import type { ErrorResponse } from "@/stores/useInternetExplorerStore";
import { getAppPublicOrigin, getIeProxyOrigin } from "@/utils/runtimeConfig";
import {
  buildIeTrustContext,
  classifyIeTarget,
  isRyoSiteHost,
  type IeTrustContext,
} from "./ieFirstParty";
import { unwrapWaybackReplayUrl } from "./waybackNavigation";

/**
 * Sandbox for IE iframes that render proxied (`/api/iframe-check`) content.
 * Never includes `allow-same-origin`: proxied pages must not run with the
 * ryOS origin. The proxy also sends a matching CSP `sandbox` header.
 */
export const IE_PROXY_IFRAME_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-pointer-lock";

const IE_DIRECT_IFRAME_SANDBOX = `${IE_PROXY_IFRAME_SANDBOX} allow-same-origin`;

export function getDefaultIeTrustContext(): IeTrustContext {
  const windowOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return buildIeTrustContext({
    windowOrigin,
    appPublicOrigin: getAppPublicOrigin(),
    proxyOrigin: getIeProxyOrigin(),
  });
}

/**
 * Pick the sandbox for an IE iframe `src`.
 * - ryOS app origins and ryo.lu (see `ieFirstParty`) get `allow-same-origin`.
 * - Other ryo.lu hosts, the isolated proxy host and anything under an app
 *   origin's `/api/` stay opaque: they are same-site with ryOS or serve
 *   proxied content.
 * - Direct embeds of unrelated sites keep `allow-same-origin`; it only grants
 *   them their own cross-site origin, as in any normal iframe.
 */
export function getIeIframeSandbox(
  src: string | null | undefined,
  context: IeTrustContext | string = getDefaultIeTrustContext()
): string {
  const ctx =
    typeof context === "string"
      ? buildIeTrustContext({ windowOrigin: context })
      : context;
  if (!src) return IE_PROXY_IFRAME_SANDBOX;
  let parsed: URL;
  try {
    parsed = new URL(src, ctx.windowOrigin);
  } catch {
    return IE_PROXY_IFRAME_SANDBOX;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return IE_PROXY_IFRAME_SANDBOX;
  }
  switch (classifyIeTarget(parsed.href, ctx)) {
    case "app":
    case "ryo":
      return IE_DIRECT_IFRAME_SANDBOX;
    case "ryo-subdomain":
      return IE_PROXY_IFRAME_SANDBOX;
    case "external":
      break;
  }
  if (
    ctx.appOrigins.includes(parsed.origin) ||
    parsed.origin === ctx.proxyOrigin ||
    isRyoSiteHost(parsed.href)
  ) {
    return IE_PROXY_IFRAME_SANDBOX;
  }
  return IE_DIRECT_IFRAME_SANDBOX;
}

/** Whether `url` is a ryOS first-party site that loads without the proxy. */
export function isIeFirstPartyDirectTarget(
  url: string,
  ctx: IeTrustContext = getDefaultIeTrustContext()
): boolean {
  return classifyIeTarget(url, ctx) !== "external";
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
    case "iframeOpenWindow": {
      // The injected script unwraps replay URLs before posting. Unwrap again
      // so a message that still carries a web.archive.org replay URL (older
      // injected script, or a link the page navigated by absolute href) stays
      // inside IE as the captured original page.
      if (typeof data.url !== "string" || !/^https?:\/\//i.test(data.url)) {
        return null;
      }
      const url = unwrapWaybackReplayUrl(data.url);
      return /^https?:\/\//i.test(url) ? { type: data.type, url } : null;
    }
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
