// Shared CORS utilities for API routes (Node.js runtime only)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getConfiguredPublicOrigin } from "./runtime-config.js";

type RuntimeEnv = "production" | "preview" | "development";

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === "string" ? value : null;
}

const PROD_ALLOWED_ORIGIN = "https://os.ryo.lu";
const TAILSCALE_ALLOWED_SUFFIX = ".tailb4fa61.ts.net";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PORTS = new Set(["80", "443", "3000", "5173"]);

// Allowed Vercel preview URL prefixes for this project
// Vercel preview URLs follow patterns like:
// - {project}-{random}.vercel.app
// - {project}-git-{branch}-{username}.vercel.app
// Only allow previews from this specific project to prevent other Vercel apps from accessing the API
const ALLOWED_VERCEL_PREVIEW_PREFIXES = [
  "ryos-",      // Main project name
  "ryo-lu-",    // Username-based prefix
  "os-ryo-",    // Alternative naming
];

function normalizeEnv(env: string | undefined): RuntimeEnv | null {
  if (env === "production" || env === "preview" || env === "development") {
    return env;
  }
  return null;
}

/**
 * Resolve runtime environment in non-Vercel contexts too.
 *
 * Priority:
 * 1) API_RUNTIME_ENV / API_ENV (self-host explicit override)
 * 2) VERCEL_ENV (Vercel deployments)
 * 3) NODE_ENV=production
 * 4) development fallback
 */
export function getRuntimeEnv(): RuntimeEnv {
  const explicitApiEnv = normalizeEnv(
    process.env.API_RUNTIME_ENV || process.env.API_ENV
  );
  if (explicitApiEnv) return explicitApiEnv;

  const vercelEnv = normalizeEnv(process.env.VERCEL_ENV);
  if (vercelEnv) return vercelEnv;

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

function isVercelPreviewOrigin(origin: string): boolean {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  
  const hostname = parsed.hostname.toLowerCase();
  
  // Must end with .vercel.app
  if (!hostname.endsWith(".vercel.app")) return false;
  
  // Must start with one of the allowed project prefixes
  // This prevents other Vercel-deployed apps from accessing the API
  return ALLOWED_VERCEL_PREVIEW_PREFIXES.some(prefix => 
    hostname.startsWith(prefix)
  );
}

function isTailscaleOrigin(origin: string): boolean {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return parsed.hostname.endsWith(TAILSCALE_ALLOWED_SUFFIX);
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

  if (tokens.includes("*")) {
    return { allowAll: true, origins: new Set(), subdomainSuffixes: [] };
  }

  const origins = new Set<string>();
  const subdomainSuffixes: string[] = [];

  for (const token of tokens) {
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

export function getEffectiveOrigin(req: VercelRequest): string | null {
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
  
  // Always allow tailscale origins (for local network access)
  if (isTailscaleOrigin(origin)) return true;
  
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const env = getRuntimeEnv();
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
      if (parsed) {
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
  if (env === "preview") {
    return isVercelPreviewOrigin(normalizedOrigin);
  }
  // Development is default fallback
  return isLocalhostOrigin(normalizedOrigin);
}

/**
 * Handle OPTIONS preflight request for Node.js runtime.
 * Returns true if preflight was handled (response sent), false otherwise.
 */
export function handlePreflight(
  req: VercelRequest,
  res: VercelResponse,
  options: SetCorsHeadersOptions = {}
): boolean {
  if (req.method !== "OPTIONS") return false;
  
  const origin = getEffectiveOrigin(req);
  if (!origin || !isAllowedOrigin(origin)) {
    res.status(403).send("Unauthorized");
    return true;
  }

  // Echo back requested headers when provided
  const requestedHeaders = getHeader(req, "access-control-request-headers");
  const allowHeaders =
    requestedHeaders && requestedHeaders.trim().length > 0
      ? requestedHeaders
      : (options.headers || DEFAULT_CORS_HEADERS).join(", ");

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", (options.methods || DEFAULT_CORS_METHODS).join(", "));
  res.setHeader("Access-Control-Allow-Headers", allowHeaders);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", String(options.maxAge || 86400));
  res.status(204).end();
  return true;
}

/**
 * Set CORS headers on a VercelResponse for Node.js runtime handlers.
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
  res: VercelResponse,
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
