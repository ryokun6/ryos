// Shared CORS utilities for API routes (Node.js runtime only)
import type { ApiRequest, ApiResponse } from "./api-types.js";
import { getConfiguredPublicOrigin } from "./runtime-config.js";
import { getHeader } from "./request-helpers.js";

type RuntimeEnv = "production" | "development";

const PROD_ALLOWED_ORIGIN = "https://os.ryo.lu";
const DEFAULT_TAILNET_ORIGIN_SUFFIX = ".tailb4fa61.ts.net";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PORTS = new Set(["80", "443", "3000", "3001", "5173"]);

function normalizeEnv(env: string | undefined): RuntimeEnv | null {
  if (env === "production" || env === "development") {
    return env;
  }
  return null;
}

/**
 * Resolve the runtime environment.
 *
 * Priority:
 * 1) API_RUNTIME_ENV / API_ENV (self-host explicit override)
 * 2) NODE_ENV=production
 * 3) development fallback
 */
export function getRuntimeEnv(): RuntimeEnv {
  const explicitApiEnv = normalizeEnv(
    process.env.API_RUNTIME_ENV || process.env.API_ENV
  );
  if (explicitApiEnv) return explicitApiEnv;

  if (process.env.NODE_ENV === "production") {
    return "production";
  }

  return "development";
}

function parseOrigin(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  if (!LOCALHOST_HOSTNAMES.has(parsed.hostname)) return false;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return LOCALHOST_PORTS.has(port);
}

/**
 * Tailnet origins (local-network access to a dev box) are allowed by default
 * in development only. Production needs `API_TAILNET_ORIGIN_SUFFIX` (e.g.
 * `.tailxxxx.ts.net`) so the public deploy never trusts a private tailnet.
 */
function getTailnetOriginSuffix(env: RuntimeEnv): string | null {
  const raw = process.env.API_TAILNET_ORIGIN_SUFFIX?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return null;
  if (raw) {
    const suffix = raw.startsWith(".") ? raw : `.${raw}`;
    return suffix.endsWith(".ts.net") ? suffix : null;
  }
  return env === "development" ? DEFAULT_TAILNET_ORIGIN_SUFFIX : null;
}

function isTailscaleOrigin(origin: string, env: RuntimeEnv): boolean {
  const suffix = getTailnetOriginSuffix(env);
  if (!suffix) return false;
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return parsed.hostname.toLowerCase().endsWith(suffix);
}

/**
 * The isolated Internet Explorer proxy origin runs arbitrary upstream
 * scripts. It is same-site with the app, so the auth cookie would ride along
 * on credentialed requests; it must never pass CORS, even via a wildcard.
 */
function isIeProxyOrigin(normalizedOrigin: string): boolean {
  const raw = process.env.IE_PROXY_ORIGIN?.trim();
  if (!raw) return false;
  return normalizeOrigin(raw) === normalizedOrigin;
}

function normalizeOrigin(origin: string): string | null {
  const parsed = parseOrigin(origin);
  return parsed?.origin ?? null;
}

interface ConfiguredAllowedOrigins {
  allowAll: boolean;
  origins: Set<string>;
  /** Suffix patterns from entries like "*.ryo.lu" → ".ryo.lu" */
  subdomainSuffixes: string[];
}

function getConfiguredAllowedOrigins(): ConfiguredAllowedOrigins {
  const raw = process.env.API_ALLOWED_ORIGINS;
  if (!raw) {
    return { allowAll: false, origins: new Set(), subdomainSuffixes: [] };
  }

  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  // `*` with credentialed CORS would let any site act as the signed-in
  // user, so it is honored only in development.
  if (tokens.includes("*") && getRuntimeEnv() === "development") {
    return { allowAll: true, origins: new Set(), subdomainSuffixes: [] };
  }

  const origins = new Set<string>();
  const subdomainSuffixes: string[] = [];

  for (const token of tokens) {
    if (token === "*") continue;
    const wildcard = token.match(/^\*\.(.+)$/);
    if (wildcard) {
      subdomainSuffixes.push(`.${wildcard[1].toLowerCase()}`);
      continue;
    }
    const normalized = normalizeOrigin(token);
    if (normalized) {
      origins.add(normalized);
    }
  }

  return { allowAll: false, origins, subdomainSuffixes };
}

export function getEffectiveOrigin(req: ApiRequest): string | null {
  try {
    const origin = getHeader(req, "origin");
    if (origin) return origin;
    const referer = getHeader(req, "referer");
    if (!referer) return null;
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;
  if (isIeProxyOrigin(normalizedOrigin)) return false;

  const env = getRuntimeEnv();
  if (isTailscaleOrigin(normalizedOrigin, env)) return true;

  const configuredOrigins = getConfiguredAllowedOrigins();

  if (configuredOrigins.allowAll) {
    return true;
  }

  // Explicit self-host allowlist takes precedence.
  const hasExplicitConfig =
    configuredOrigins.origins.size > 0 ||
    configuredOrigins.subdomainSuffixes.length > 0;

  if (hasExplicitConfig) {
    if (configuredOrigins.origins.has(normalizedOrigin)) return true;

    if (configuredOrigins.subdomainSuffixes.length > 0) {
      const parsed = parseOrigin(normalizedOrigin);
      // Wildcard entries only cover https origins outside development.
      if (parsed && (parsed.protocol === "https:" || env === "development")) {
        const hostname = parsed.hostname.toLowerCase();
        if (
          configuredOrigins.subdomainSuffixes.some((suffix) =>
            hostname.endsWith(suffix)
          )
        ) {
          return true;
        }
      }
    }

    // Keep localhost available in development even with explicit allowlist.
    if (env === "development" && isLocalhostOrigin(normalizedOrigin)) return true;
    return false;
  }

  if (env === "production") {
    return (
      normalizedOrigin === (getConfiguredPublicOrigin() || PROD_ALLOWED_ORIGIN)
    );
  }
  // Development is default fallback
  return isLocalhostOrigin(normalizedOrigin);
}

/**
 * Set CORS headers on an ApiResponse.
 */
export interface SetCorsHeadersOptions {
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_CORS_METHODS = ["GET", "POST", "OPTIONS"];
const DEFAULT_CORS_HEADERS = ["Content-Type", "Authorization", "X-Username"];

export function setCorsHeaders(
  res: ApiResponse,
  origin: string | null | undefined,
  options: SetCorsHeadersOptions = {}
): void {
  const {
    methods = DEFAULT_CORS_METHODS,
    headers = DEFAULT_CORS_HEADERS,
    credentials = true,
    maxAge = 86400,
  } = options;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", headers.join(", "));
  if (credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Max-Age", String(maxAge));
}
