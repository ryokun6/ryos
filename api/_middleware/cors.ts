/**
 * CORS middleware for API routes
 * Handles origin validation and preflight requests
 */

import { corsPreflightResponse, withCors } from "../_lib/response.js";
import { forbidden } from "../_lib/errors.js";
import { jsonError } from "../_lib/response.js";

// =============================================================================
// Configuration
// =============================================================================

type VercelEnv = "production" | "preview" | "development";

const PROD_ALLOWED_ORIGIN = "https://os.ryo.lu";
const TAILSCALE_ALLOWED_SUFFIX = ".tailb4fa61.ts.net";
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PORTS = new Set(["80", "443", "3000", "5173"]);

// Allowed Vercel preview URL prefixes
const ALLOWED_VERCEL_PREVIEW_PREFIXES = [
  "ryos-",
  "ryo-lu-",
  "os-ryo-",
];

// =============================================================================
// Helper Functions
// =============================================================================

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
  
  if (!hostname.endsWith(".vercel.app")) return false;
  
  return ALLOWED_VERCEL_PREVIEW_PREFIXES.some(prefix => 
    hostname.startsWith(prefix)
  );
}

function isTailscaleOrigin(origin: string): boolean {
  const parsed = parseOrigin(origin);
  if (!parsed) return false;
  return parsed.hostname.endsWith(TAILSCALE_ALLOWED_SUFFIX);
}

// =============================================================================
// Exported Functions
// =============================================================================

/**
 * Get the effective origin from the request
 */
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

/**
 * Check if an origin is allowed
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  
  // Always allow tailscale origins
  if (isTailscaleOrigin(origin)) return true;
  
  const env = getRuntimeEnv();

  if (env === "production") {
    return origin === PROD_ALLOWED_ORIGIN;
  }
  if (env === "preview") {
    return isVercelPreviewOrigin(origin);
  }
  // Development
  return isLocalhostOrigin(origin);
}

/**
 * Handle CORS preflight if this is an OPTIONS request
 * Returns a Response if handled, null if not a preflight request
 */
export function handleCorsPreflightIfNeeded(
  req: Request,
  allowedMethods: string[]
): Response | null {
  if (req.method !== "OPTIONS") return null;
  
  const origin = getEffectiveOrigin(req);
  
  if (!origin || !isAllowedOrigin(origin)) {
    return jsonError(forbidden("Unauthorized origin"), {
      "Access-Control-Allow-Origin": origin || "*",
    });
  }

  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  return corsPreflightResponse(origin, allowedMethods, requestedHeaders);
}

/**
 * Create a CORS-aware response wrapper
 */
export function createCorsHandler(
  handler: (req: Request, origin: string) => Promise<Response>,
  allowedMethods: string[] = ["GET", "POST", "OPTIONS"]
) {
  return async (req: Request): Promise<Response> => {
    // Handle preflight
    const preflightResponse = handleCorsPreflightIfNeeded(req, allowedMethods);
    if (preflightResponse) return preflightResponse;
    
    // Validate origin
    const origin = getEffectiveOrigin(req);
    if (!isAllowedOrigin(origin)) {
      return jsonError(forbidden("Unauthorized origin"));
    }
    
    // Run handler and add CORS headers
    const response = await handler(req, origin!);
    return withCors(response, origin);
  };
}

/**
 * Simple CORS validation - returns the origin if valid, null otherwise
 */
export function validateOrigin(req: Request): string | null {
  const origin = getEffectiveOrigin(req);
  if (!origin || !isAllowedOrigin(origin)) {
    return null;
  }
  return origin;
}
