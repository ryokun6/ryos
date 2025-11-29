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
  // Allow any localhost port number or local network IPs
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "100.110.251.60") {
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
  const headers = {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": allowedMethods.join(", "),
    "Access-Control-Allow-Headers": "Content-Type",
  };
  return new Response(null, { headers });
}


