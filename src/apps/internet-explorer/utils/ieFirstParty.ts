/**
 * Which IE targets are ryOS's own sites and may load directly (scripts
 * running, no proxy) instead of through the sandboxed `/api/iframe-check`.
 *
 * - App origins (the current window origin, the configured public origin and
 *   os.ryo.lu) load directly with `allow-same-origin`: ryOS needs its storage
 *   to boot, and it is our own code. Their `/api/` paths never count, so API
 *   responses (the proxy included) are never framed with the app origin.
 * - `https://ryo.lu` loads directly with `allow-same-origin`.
 * - Other https subdomains of ryo.lu load directly with scripts but without
 *   `allow-same-origin`; some of them (deploy tooling, user content) are not
 *   ours to vouch for.
 * - The isolated IE proxy host (`IE_PROXY_ORIGIN`) is never first-party.
 *
 * Matching is on the parsed origin only: exact hosts, default ports, https
 * (except the current window origin, so http://localhost dev works), and no
 * userinfo.
 */

export const DEFAULT_APP_ORIGIN = "https://os.ryo.lu";
export const RYO_APEX_HOST = "ryo.lu";

export type IeTargetTrust =
  /** ryOS itself: direct load, scripts + allow-same-origin. */
  | "app"
  /** ryo.lu: direct load, scripts + allow-same-origin. */
  | "ryo"
  /** Another https ryo.lu subdomain: direct load, scripts only. */
  | "ryo-subdomain"
  /** Everything else: through the proxy (or an existing passthrough rule). */
  | "external";

export interface IeTrustContext {
  windowOrigin: string;
  appOrigins: readonly string[];
  proxyOrigin: string | null;
}

function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildIeTrustContext(options: {
  windowOrigin: string;
  appPublicOrigin?: string | null;
  proxyOrigin?: string | null;
}): IeTrustContext {
  const windowOrigin = toOrigin(options.windowOrigin) ?? options.windowOrigin;
  const proxyOrigin = toOrigin(options.proxyOrigin);
  const appOrigins = new Set<string>([windowOrigin, DEFAULT_APP_ORIGIN]);
  const publicOrigin = toOrigin(options.appPublicOrigin);
  if (publicOrigin) appOrigins.add(publicOrigin);
  if (proxyOrigin) appOrigins.delete(proxyOrigin);
  return { windowOrigin, appOrigins: [...appOrigins], proxyOrigin };
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** `host:port...`, which URL parsing would otherwise read as a scheme. */
const HOST_PORT = /^[^/:?#]+:\d+(?:[/?#]|$)/;

/**
 * Adds a scheme to a typed address: https, except that an address whose host
 * is exactly the current (http) window host keeps http, so the local dev app
 * at http://localhost:PORT can be opened by typing `localhost:PORT`.
 */
export function withIeDefaultScheme(url: string, windowOrigin?: string | null): string {
  const trimmed = url.trim();
  if (!trimmed || HAS_SCHEME.test(trimmed)) return trimmed;
  const current = toOrigin(windowOrigin);
  if (current?.startsWith("http://")) {
    try {
      const candidate = new URL(`http://${trimmed}`);
      if (candidate.origin === current && !candidate.username && !candidate.password) {
        return `http://${trimmed}`;
      }
    } catch {
      // not a parseable host; fall through to https
    }
  }
  return `https://${trimmed}`;
}

function parseTarget(url: string, windowOrigin?: string): URL | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !HOST_PORT.test(trimmed);
    return new URL(hasScheme ? trimmed : withIeDefaultScheme(trimmed, windowOrigin));
  } catch {
    return null;
  }
}

export function classifyIeTarget(url: string, ctx: IeTrustContext): IeTargetTrust {
  const parsed = parseTarget(url, ctx.windowOrigin);
  if (!parsed) return "external";
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "external";
  if (parsed.username || parsed.password) return "external";

  const origin = parsed.origin;
  if (ctx.proxyOrigin && origin === ctx.proxyOrigin) return "external";

  const isApiPath = parsed.pathname === "/api" || parsed.pathname.startsWith("/api/");
  if (ctx.appOrigins.includes(origin)) {
    if (isApiPath) return "external";
    if (origin === ctx.windowOrigin || parsed.protocol === "https:") return "app";
  }

  if (parsed.protocol !== "https:" || parsed.port !== "") return "external";
  const host = parsed.hostname.toLowerCase();
  if (host === RYO_APEX_HOST) return "ryo";
  if (host.endsWith(`.${RYO_APEX_HOST}`)) return "ryo-subdomain";
  return "external";
}

/** Same-site with ryo.lu (any scheme or port), whether or not trusted. */
export function isRyoSiteHost(url: string): boolean {
  const parsed = parseTarget(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return host === RYO_APEX_HOST || host.endsWith(`.${RYO_APEX_HOST}`);
}
