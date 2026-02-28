import type { VercelRequest } from "@vercel/node";
import { geolocation } from "@vercel/functions";

export interface RequestGeo {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

function getHeader(req: VercelRequest, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return typeof value === "string" ? value : null;
}

function getHeaderGeo(req: VercelRequest): RequestGeo {
  const city =
    getHeader(req, "x-vercel-ip-city") ||
    getHeader(req, "cf-ipcity") ||
    getHeader(req, "x-geo-city") ||
    undefined;
  const region =
    getHeader(req, "x-vercel-ip-country-region") ||
    getHeader(req, "x-geo-region") ||
    undefined;
  const country =
    getHeader(req, "x-vercel-ip-country") ||
    getHeader(req, "cf-ipcountry") ||
    getHeader(req, "x-geo-country") ||
    undefined;
  const latitude =
    getHeader(req, "x-vercel-ip-latitude") ||
    getHeader(req, "x-geo-latitude") ||
    undefined;
  const longitude =
    getHeader(req, "x-vercel-ip-longitude") ||
    getHeader(req, "x-geo-longitude") ||
    undefined;

  return {
    ...(city ? { city } : {}),
    ...(region ? { region } : {}),
    ...(country ? { country } : {}),
    ...(latitude ? { latitude } : {}),
    ...(longitude ? { longitude } : {}),
  };
}

/**
 * Runtime-agnostic geolocation extraction for dual Vercel + VPS deployments.
 * - On Vercel: uses @vercel/functions geolocation().
 * - On VPS/proxy: falls back to standard forwarding headers.
 */
export function getRequestGeolocation(req: VercelRequest): RequestGeo {
  try {
    const geo = geolocation(req as unknown as Request);
    if (geo && Object.keys(geo).length > 0) {
      return geo as RequestGeo;
    }
  } catch {
    // Ignore; fallback to headers below.
  }

  return getHeaderGeo(req);
}
