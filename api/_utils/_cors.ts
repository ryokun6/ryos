// Shared CORS utilities for API routes
// Supports both Edge (Request/Response) and Node.js (VercelRequest/VercelResponse) runtimes

import type { VercelRequest, VercelResponse } from "@vercel/node";

type VercelEnv = "production" | "preview" | "development";

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

export function getEffectiveOrigin(req: Request): string | null {
  try {
    const origin = req.headers.get("origin");
    if (origin) return origin;
    const referer = req.headers.get("referer");
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

export function preflightIfNeeded(
  req: Request,
  allowedMethods: string[],
  effectiveOrigin: string | null
): Response | null {
  if (req.method !== "OPTIONS") return null;
  if (!effectiveOrigin || !isAllowedOrigin(effectiveOrigin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Echo back requested headers when provided to avoid missing-case issues
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  const allowHeaders =
    requestedHeaders && requestedHeaders.trim().length > 0
      ? requestedHeaders
      : "Content-Type, Authorization, X-Username, User-Agent";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Credentials": "true",
  };
  return new Response(null, { headers });
}

// ============================================================================
// Node.js (VercelRequest/VercelResponse) Helpers
// ============================================================================

/**
 * Get header value from VercelRequest (handles string or string[] types)
 */
function getVercelHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

/**
 * Get effective origin from VercelRequest headers
 */
export function getEffectiveOriginNode(req: VercelRequest): string | null {
  try {
    const origin = getVercelHeader(req, "origin");
    if (origin) return origin;
    const referer = getVercelHeader(req, "referer");
    if (!referer) return null;
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Set CORS headers on VercelResponse
 */
export function setCorsHeadersNode(
  res: VercelResponse,
  origin: string | null | undefined,
  methods: string[] = ["GET", "POST", "DELETE", "OPTIONS"]
): void {
  res.setHeader("Content-Type", "application/json");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Username, User-Agent");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

/**
 * Handle CORS preflight for VercelRequest/VercelResponse
 * Returns true if preflight was handled, false otherwise
 */
export function handlePreflightNode(
  req: VercelRequest,
  res: VercelResponse,
  allowedMethods: string[] = ["GET", "POST", "DELETE", "OPTIONS"]
): boolean {
  if (req.method !== "OPTIONS") return false;
  
  const origin = getEffectiveOriginNode(req);
  if (!origin || !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return true;
  }
  
  // Echo back requested headers when provided
  const requestedHeaders = getVercelHeader(req, "access-control-request-headers");
  const allowHeaders =
    requestedHeaders && requestedHeaders.trim().length > 0
      ? requestedHeaders
      : "Content-Type, Authorization, X-Username, User-Agent";
  
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", allowedMethods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", allowHeaders);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.status(204).end();
  return true;
}

/**
 * Get client IP from VercelRequest
 */
export function getClientIpNode(req: VercelRequest): string {
  try {
    const origin = getVercelHeader(req, "origin") || "";
    const xVercel = getVercelHeader(req, "x-vercel-forwarded-for");
    const xForwarded = getVercelHeader(req, "x-forwarded-for");
    const xRealIp = getVercelHeader(req, "x-real-ip");
    const cfIp = getVercelHeader(req, "cf-connecting-ip");
    const raw = xVercel || xForwarded || xRealIp || cfIp || "";
    let ip = raw.split(",")[0].trim();

    if (!ip) ip = "unknown-ip";

    // Normalize IPv6-mapped IPv4 and loopback variants
    ip = ip.replace(/^::ffff:/i, "");
    const lower = ip.toLowerCase();
    const isLocalOrigin = /^http:\/\/localhost(?::\d+)?$/.test(origin);
    if (
      isLocalOrigin ||
      lower === "::1" ||
      lower === "0:0:0:0:0:0:0:1" ||
      lower === "127.0.0.1"
    ) {
      return "localhost-dev";
    }

    return ip;
  } catch {
    return "unknown-ip";
  }
}
