// Shared CORS utilities for API routes (JS file so JS and TS can both import)

export const ALLOWED_ORIGINS = new Set([
  "https://os.ryo.lu",
  "https://ryo.lu",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://100.110.251.60",
  "http://100.110.251.60:3000",
]);

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
  // Check explicit allowed origins
  if (ALLOWED_ORIGINS.has(origin)) return true;
  
  // Allow specific localhost ports for development, local network IPs, or Vercel preview links
  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    
    // Only allow specific localhost ports for security
    const allowedLocalhostPorts = new Set(["3000", "5173", "80", "443"]);
    
    if ((hostname === "localhost" || hostname === "127.0.0.1") && allowedLocalhostPorts.has(port)) {
      return true;
    }
    
    // Allow the specific local network IP (no port restriction for this one as it's a specific IP)
    if (hostname === "100.110.251.60") {
      return true;
    }
    // Allow Vercel preview deployments (e.g., ryos-git-main-ryo-lus-projects.vercel.app)
    if (url.hostname.endsWith("-ryo-lus-projects.vercel.app")) {
      return true;
    }
  } catch {
    // Invalid URL, fall through to return false
  }
  return false;
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


