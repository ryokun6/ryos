// Shared CORS utilities for API routes (JS file so JS and TS can both import)

const PROD_ALLOWED_ORIGIN = "https://os.ryo.lu";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PORTS = new Set(["80", "443", "3000", "5173"]);

function getRuntimeEnv() {
  const env = process.env.VERCEL_ENV;
  if (env === "production" || env === "preview" || env === "development") {
    return env;
  }
  return "development";
}

function parseOrigin(origin) {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function isLocalhostOrigin(origin) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  if (!LOCALHOST_HOSTNAMES.has(parsed.hostname)) return false;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  return LOCALHOST_PORTS.has(port);
}

function isVercelPreviewOrigin(origin) {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return parsed.hostname.endsWith(".vercel.app");
}

export function getEffectiveOrigin(req) {
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

export function isAllowedOrigin(origin) {
  if (!origin) return false;
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

export function preflightIfNeeded(req, allowedMethods, effectiveOrigin) {
  if (req.method !== "OPTIONS") return null;
  if (!isAllowedOrigin(effectiveOrigin)) return new Response("Unauthorized", { status: 403 });

  // Echo back requested headers when provided to avoid missing-case issues
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  const allowHeaders =
    requestedHeaders && requestedHeaders.trim().length > 0
      ? requestedHeaders
      : "Content-Type, Authorization, X-Username, User-Agent";

  const headers = {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Credentials": "true",
  };
  return new Response(null, { headers });
}


