// Shared CORS utilities for API routes (Node.js runtime only)
import type { VercelRequest, VercelResponse } from "@vercel/node";

type VercelEnv = "production" | "preview" | "development";
export const CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES = 50;

// Helper to get header value from Node.js IncomingMessage headers
function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNonEmptyHeaderValues(
  req: VercelRequest,
  name: string,
  maxValues = Number.POSITIVE_INFINITY
): string[] {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    const nonEmptyValues: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (index >= maxValues) {
        break;
      }

      const entry = value[index];
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      nonEmptyValues.push(trimmed);
    }
    return nonEmptyValues;
  }

  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  return trimmed.length > 0 ? [trimmed] : [];
}

function splitTrimmedHeaderTokens(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function appendVaryHeaders(res: VercelResponse, tokens: string[]): void {
  const responseWithGetHeader = res as unknown as {
    getHeader?: (name: string) => unknown;
  };
  const existingRaw = responseWithGetHeader.getHeader?.("Vary");

  const existingValues: string[] = [];
  if (typeof existingRaw === "string") {
    existingValues.push(...splitTrimmedHeaderTokens(existingRaw));
  } else if (Array.isArray(existingRaw)) {
    for (const value of existingRaw) {
      if (typeof value === "string") {
        existingValues.push(...splitTrimmedHeaderTokens(value));
      }
    }
  }

  const mergedValues: string[] = [];
  const seen = new Set<string>();

  const addValue = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    mergedValues.push(trimmed);
  };

  for (const value of existingValues) addValue(value);
  for (const value of tokens) addValue(value);

  if (mergedValues.length > 0) {
    res.setHeader("Vary", mergedValues.join(", "));
  }
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
  const normalizedMethod =
    typeof req.method === "string" ? req.method.trim().toUpperCase() : "";
  if (normalizedMethod !== "OPTIONS") return false;

  appendVaryHeaders(res, ["Origin", "Access-Control-Request-Headers"]);
  
  const origin = getEffectiveOrigin(req);
  if (!origin || !isAllowedOrigin(origin)) {
    res.status(403).send("Unauthorized");
    return true;
  }

  // Echo back requested headers when provided
  const requestedHeaderValues = getNonEmptyHeaderValues(
    req,
    "access-control-request-headers",
    CORS_MAX_PREFLIGHT_REQUESTED_HEADER_VALUES
  );
  const allowHeaders =
    requestedHeaderValues.length > 0
      ? requestedHeaderValues.join(", ")
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
    appendVaryHeaders(res, ["Origin"]);
  }
  res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
  res.setHeader("Access-Control-Allow-Headers", headers.join(", "));
  if (credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Max-Age", String(maxAge));
}
