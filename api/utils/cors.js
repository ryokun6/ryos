// Shared CORS utilities for API routes (JS file so JS and TS can both import)

export const ALLOWED_ORIGINS = new Set([
  "https://bravohenry.com",
  "http://localhost:3000",
  "http://localhost:5173",
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
  return !!origin && ALLOWED_ORIGINS.has(origin);
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


