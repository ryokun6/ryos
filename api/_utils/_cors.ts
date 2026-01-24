// Shared CORS utilities for API routes
import type { VercelRequest } from "@vercel/node";

type VercelEnv = "production" | "preview" | "development";

// Helper to get header value from both Web Request and Node.js IncomingMessage
// Handles vercel dev (Node.js headers object) and production (Web Headers)
function getHeader(req: Request | VercelRequest, name: string): string | null {
  // Web standard Headers (has .get method)
  if (req.headers && typeof (req.headers as Headers).get === 'function') {
    return (req.headers as Headers).get(name);
  }
  // Node.js style headers (plain object)
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return typeof value === 'string' ? value : null;
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

export function getEffectiveOrigin(req: Request | VercelRequest): string | null {
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

export function preflightIfNeeded(
  req: Request | VercelRequest,
  allowedMethods: string[],
  effectiveOrigin: string | null
): Response | null {
  if (req.method !== "OPTIONS") return null;
  if (!effectiveOrigin || !isAllowedOrigin(effectiveOrigin)) {
    return new Response("Unauthorized", { status: 403 });
  }

  // Echo back requested headers when provided to avoid missing-case issues
  const requestedHeaders = getHeader(req, "Access-Control-Request-Headers");
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
