/**
 * App-wide security response headers shared by the standalone Bun server and
 * the Internet Explorer proxy route.
 */

import { getConfiguredPublicOrigin } from "./runtime-config.js";
import { getRuntimeEnv } from "./_cors.js";

const DEFAULT_APP_ORIGIN = "https://os.ryo.lu";

/**
 * Who may frame ryOS documents and session-carrying API responses: the app
 * itself, ryo.lu, and any https *.ryo.lu subdomain. `X-Frame-Options` cannot (pragma: allowlist secret)
 * express an allowlist, so only CSP `frame-ancestors` is sent.
 */
export const BASE_FRAME_ANCESTORS = [
  "'self'",
  "https://ryo.lu",
  "https://*.ryo.lu", // pragma: allowlist secret
] as const;

export const HSTS_HEADER_VALUE = "max-age=31536000; includeSubDomains";
export const REFERRER_POLICY_VALUE = "strict-origin-when-cross-origin";

function parseExtraFrameAncestors(): string[] {
  const raw = process.env.APP_FRAME_ANCESTORS;
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        token !== "*" &&
        /^(https?:\/\/[a-z0-9*.:[\]-]+|'self')$/i.test(token)
    );
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function getDocumentFrameAncestors(): string[] {
  return dedupe([...BASE_FRAME_ANCESTORS, ...parseExtraFrameAncestors()]);
}

/**
 * Ancestors allowed to frame `/api/iframe-check` documents. When the proxy
 * runs on its own origin `'self'` is that origin, so the app origins must be
 * listed explicitly. `frame-ancestors` checks every ancestor, so ryo.lu and
 * *.ryo.lu (which may frame os.ryo.lu) have to stay in the list too. (pragma: allowlist secret)
 */
export function getIeProxyFrameAncestors(): string[] {
  const values = getDocumentFrameAncestors();
  values.push(getConfiguredPublicOrigin() || DEFAULT_APP_ORIGIN);

  const allowed = process.env.API_ALLOWED_ORIGINS;
  if (allowed) {
    for (const token of allowed.split(",").map((t) => t.trim())) {
      if (!token || token === "*") continue;
      const wildcard = token.match(/^\*\.(.+)$/);
      if (wildcard) {
        values.push(`https://*.${wildcard[1].toLowerCase()}`);
        continue;
      }
      try {
        values.push(new URL(token).origin);
      } catch {
        /* ignore malformed entries */
      }
    }
  }

  if (getRuntimeEnv() === "development") {
    values.push("http://localhost:*", "http://127.0.0.1:*");
  }

  return dedupe(values);
}

export function buildFrameAncestorsDirective(ancestors: string[]): string {
  return `frame-ancestors ${ancestors.join(" ")}`;
}

function shouldSendHsts(request: Request): boolean {
  const override = process.env.APP_HSTS?.trim().toLowerCase();
  if (override === "0" || override === "false") return false;
  if (override === "1" || override === "true") return true;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto === "https") return true;
  if (new URL(request.url).protocol === "https:") return true;
  const publicOrigin = getConfiguredPublicOrigin();
  return getRuntimeEnv() === "production" && !!publicOrigin?.startsWith("https://");
}

/**
 * Add baseline security headers to a response without overriding anything a
 * route already chose (for example the IE proxy's stricter CSP).
 */
export function applySecurityHeaders(response: Response, request: Request): Response {
  const headers = response.headers;
  try {
    if (!headers.has("x-content-type-options")) {
      headers.set("X-Content-Type-Options", "nosniff");
    }
    if (!headers.has("referrer-policy")) {
      headers.set("Referrer-Policy", REFERRER_POLICY_VALUE);
    }
    if (!headers.has("strict-transport-security") && shouldSendHsts(request)) {
      headers.set("Strict-Transport-Security", HSTS_HEADER_VALUE);
    }
    const existingCsp = headers.get("content-security-policy");
    const frameAncestors = buildFrameAncestorsDirective(getDocumentFrameAncestors());
    if (!existingCsp) {
      headers.set("Content-Security-Policy", frameAncestors);
    } else if (!/(^|;)\s*frame-ancestors\b/i.test(existingCsp)) {
      headers.set("Content-Security-Policy", `${existingCsp}; ${frameAncestors}`);
    }
    return response;
  } catch {
    // Some Response objects (e.g. Response.redirect) have immutable headers.
    return applySecurityHeaders(new Response(response.body, response), request);
  }
}
