import {
  parseIpGeolocationPoint,
  type IpGeolocationPoint,
} from "@/shared/ipGeolocation";

export const MAPS_GEO_ENDPOINT = "/api/geo";
export const MAPS_GEO_TIMEOUT_MS = 4000;

export type ApproximateCityLocation = IpGeolocationPoint & {
  city?: string;
};

type Cache =
  | { status: "idle" }
  | { status: "pending"; promise: Promise<ApproximateCityLocation | null> }
  | { status: "ready"; value: ApproximateCityLocation | null };

let cache: Cache = { status: "idle" };

export function peekApproximateCityLocation(): ApproximateCityLocation | null {
  return cache.status === "ready" ? cache.value : null;
}

export function parseApproximateCityResponse(
  raw: unknown
): ApproximateCityLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as {
    latitude?: unknown;
    longitude?: unknown;
    city?: unknown;
    source?: unknown;
  };
  if (body.source === "none") return null;
  const point = parseIpGeolocationPoint({
    latitude:
      typeof body.latitude === "number" || typeof body.latitude === "string"
        ? body.latitude
        : undefined,
    longitude:
      typeof body.longitude === "number" || typeof body.longitude === "string"
        ? body.longitude
        : undefined,
  });
  if (!point) return null;
  const city = typeof body.city === "string" && body.city.trim() ? body.city : undefined;
  return city ? { ...point, city } : point;
}

async function loadApproximateCityLocation(
  fetchImpl: typeof fetch
): Promise<ApproximateCityLocation | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAPS_GEO_TIMEOUT_MS);
  try {
    const response = await fetchImpl(MAPS_GEO_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseApproximateCityResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchApproximateCityLocation(
  fetchImpl: typeof fetch = fetch
): Promise<ApproximateCityLocation | null> {
  if (cache.status === "ready") return Promise.resolve(cache.value);
  if (cache.status === "pending") return cache.promise;
  const promise = loadApproximateCityLocation(fetchImpl).then((value) => {
    cache = { status: "ready", value };
    return value;
  });
  cache = { status: "pending", promise };
  return promise;
}

/** Test-only: reset the session cache between suites. */
export function resetApproximateCityLocationCache(): void {
  cache = { status: "idle" };
}
