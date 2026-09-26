/**
 * Shared IP-geolocation coordinate parsing.
 *
 * Server chat/weather/maps tools and the Maps first-open camera all read
 * the same `latitude` / `longitude` strings that `resolveIpGeolocation`
 * (and Cloudflare / Vercel geo headers) produce.
 */

export interface IpGeolocationLike {
  city?: string;
  region?: string;
  country?: string;
  latitude?: string | number;
  longitude?: string | number;
}

export interface IpGeolocationPoint {
  latitude: number;
  longitude: number;
}

export interface GeoLookupResponse {
  latitude: number | null;
  longitude: number | null;
  city?: string;
  region?: string;
  country?: string;
  source: "ip" | "none";
}

function coerceCoordinate(value: string | number | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const num = Number(value.trim());
  return Number.isFinite(num) ? num : null;
}

/**
 * Coerce IP-geo lat/lng and reject Null Island / out-of-range values.
 * Providers (and Vercel) sometimes ship 0,0 for unknown IPs.
 */
export function parseIpGeolocationPoint(
  geo: IpGeolocationLike | null | undefined
): IpGeolocationPoint | null {
  if (!geo) return null;
  const latitude = coerceCoordinate(geo.latitude);
  const longitude = coerceCoordinate(geo.longitude);
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export function buildGeoLookupResponse(
  geo: IpGeolocationLike | null | undefined
): GeoLookupResponse {
  const point = parseIpGeolocationPoint(geo);
  if (!point) {
    return { latitude: null, longitude: null, source: "none" };
  }
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    ...(geo?.city ? { city: geo.city } : {}),
    ...(geo?.region ? { region: geo.region } : {}),
    ...(geo?.country ? { country: geo.country } : {}),
    source: "ip",
  };
}
