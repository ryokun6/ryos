// Shared CORS utilities for API routes

type VercelEnv = "production" | "preview" | "development";

const PROD_ALLOWED_ORIGIN = "https://os.ryo.lu";
const TAILSCALE_ALLOWED_SUFFIX = ".tailb4fa61.ts.net";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PORTS = new Set(["80", "443", "3000", "3001", "3002", "4000", "5173", "8080", "8000"]);

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
  return parsed.hostname.endsWith(".vercel.app");
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
