// Shared CORS utilities for API routes (Node.js runtime only)
import type { VercelRequest, VercelResponse } from "@vercel/node";

type VercelEnv = "production" | "preview" | "development";

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

function getRuntimeEnv(): VercelEnv {
  const env = process.env.VERCEL_ENV;
  if (env === "production" || env === "preview" || env === "development") {
    return env;
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
  
  const env = getRuntimeEnv();

  if (env === "production") {
    return origin === PROD_ALLOWED_ORIGIN;
  }
  if (env === "preview") {
    return isVercelPreviewOrigin(origin);
  }
  // Development is default fallback
  return isLocalhostOrigin(origin);
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

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", headers.join(", "));
  if (credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Max-Age", String(maxAge));
}
