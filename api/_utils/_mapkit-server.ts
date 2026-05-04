import { signMapKitJwt } from "./_mapkit-jwt.js";

/**
 * Apple Maps Server API client.
 *
 * Flow:
 *   1. Sign a short-lived team JWT (`signMapKitJwt("maps-server-api", …)`).
 *   2. POST it as the Bearer to `https://maps-api.apple.com/v1/token` to get
 *      back a 30-minute `accessToken`.
 *   3. Use `accessToken` as the Bearer for `/v1/search`, `/v1/geocode`, etc.
 *
 * Step 2 is rate-limited and counts against the team's daily quota separately
 * from MapKit JS, so we cache the access token in-memory and reuse it across
 * requests on the same server instance.
 *
 *   https://developer.apple.com/documentation/applemapsserverapi
 */

const MAPS_API_HOST = "https://maps-api.apple.com";
const AUTH_JWT_TTL_SECONDS = 5 * 60; // short — only used to fetch an access token
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;

interface CachedAccessToken {
  token: string;
  expiresAt: number; // epoch ms
}

let cachedAccessToken: CachedAccessToken | null = null;
let inFlightAccessTokenFetch: Promise<string> | null = null;

async function fetchAccessToken(): Promise<string> {
  const now = Date.now();
  if (
    cachedAccessToken &&
    cachedAccessToken.expiresAt - now > ACCESS_TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedAccessToken.token;
  }

  if (inFlightAccessTokenFetch) return inFlightAccessTokenFetch;

  inFlightAccessTokenFetch = (async () => {
    const authJwt = await signMapKitJwt("maps-server-api", AUTH_JWT_TTL_SECONDS);
    const response = await fetch(`${MAPS_API_HOST}/v1/token`, {
      method: "GET",
      headers: { Authorization: `Bearer ${authJwt.token}` },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `Apple Maps Server API token exchange failed: ${response.status} ${detail.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as {
      accessToken?: string;
      expiresInSeconds?: number;
    };
    if (!data.accessToken) {
      throw new Error("Apple Maps Server API token response missing accessToken");
    }
    const expiresInMs = (data.expiresInSeconds ?? 1800) * 1000;
    cachedAccessToken = {
      token: data.accessToken,
      // Apple normally returns 1800s; clamp the cache slightly below so we
      // refresh before the token actually expires server-side.
      expiresAt: Date.now() + expiresInMs - 30_000,
    };
    return data.accessToken;
  })();

  try {
    return await inFlightAccessTokenFetch;
  } finally {
    inFlightAccessTokenFetch = null;
  }
}

export interface MapKitSearchPlaceCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapKitSearchPlaceStructuredAddress {
  administrativeArea?: string;
  administrativeAreaCode?: string;
  locality?: string;
  postCode?: string;
  subLocality?: string;
  thoroughfare?: string;
  subThoroughfare?: string;
  fullThoroughfare?: string;
  areasOfInterest?: string[];
  dependentLocalities?: string[];
}

export interface MapKitSearchPlace {
  /** Apple Place ID (introduced alongside MapKit JS 5.78). Optional. */
  placeId?: string;
  name?: string;
  formattedAddressLines?: string[];
  structuredAddress?: MapKitSearchPlaceStructuredAddress;
  country?: string;
  countryCode?: string;
  coordinate?: MapKitSearchPlaceCoordinate;
  displayMapRegion?: {
    southLatitude?: number;
    westLongitude?: number;
    northLatitude?: number;
    eastLongitude?: number;
  };
  /**
   * MapKit point-of-interest category (e.g. "Restaurant", "Cafe"). Older
   * responses sometimes omit this. We normalize the field name when reading.
   */
  poiCategory?: string;
  pointOfInterestCategory?: string;
  category?: string;
}

export interface MapKitSearchResponse {
  /** The bounding region that contains all results. */
  displayMapRegion?: {
    southLatitude?: number;
    westLongitude?: number;
    northLatitude?: number;
    eastLongitude?: number;
  };
  results?: MapKitSearchPlace[];
}

export interface SearchPlacesOptions {
  q: string;
  /** Bias center for the search ("lat,lng"). */
  searchLocation?: { latitude: number; longitude: number };
  /** Bias bounding region. */
  searchRegion?: {
    northLatitude: number;
    eastLongitude: number;
    southLatitude: number;
    westLongitude: number;
  };
  /** Approximate user location for ranking ("lat,lng"). */
  userLocation?: { latitude: number; longitude: number };
  /** Comma-separated list of result types e.g. "Poi,Address". */
  resultTypeFilter?: string;
  /** ISO 3166-1 alpha-2 country codes. */
  limitToCountries?: string[];
  /** BCP-47 language tag for response text. */
  lang?: string;
  /** Whether the search may include results outside of the supplied region. */
  includePoiCategories?: string[];
  excludePoiCategories?: string[];
  /** Optional fetch abort signal. */
  signal?: AbortSignal;
}

function formatCoord(coord: { latitude: number; longitude: number }): string {
  return `${coord.latitude},${coord.longitude}`;
}

function formatRegion(region: {
  northLatitude: number;
  eastLongitude: number;
  southLatitude: number;
  westLongitude: number;
}): string {
  // Apple expects northLatitude,eastLongitude,southLatitude,westLongitude.
  return `${region.northLatitude},${region.eastLongitude},${region.southLatitude},${region.westLongitude}`;
}

/**
 * Call Apple's `/v1/search` and return the parsed response. Throws on HTTP
 * errors with the upstream status/body included so callers can surface a
 * useful message back to the model.
 */
export async function searchPlaces(
  options: SearchPlacesOptions
): Promise<MapKitSearchResponse> {
  const accessToken = await fetchAccessToken();
  const url = new URL(`${MAPS_API_HOST}/v1/search`);
  url.searchParams.set("q", options.q);

  // Apple's /v1/search rejects requests containing BOTH `searchLocation` and
  // `searchRegion` ("cannot specify both searchRegion and searchLocation").
  // Prefer `searchLocation` when callers accidentally provide both — it's the
  // stronger ranking signal and matches `userLocation`.
  if (options.searchLocation) {
    url.searchParams.set("searchLocation", formatCoord(options.searchLocation));
  } else if (options.searchRegion) {
    url.searchParams.set("searchRegion", formatRegion(options.searchRegion));
  }
  if (options.userLocation) {
    url.searchParams.set("userLocation", formatCoord(options.userLocation));
  }
  if (options.resultTypeFilter) {
    url.searchParams.set("resultTypeFilter", options.resultTypeFilter);
  }
  if (options.limitToCountries && options.limitToCountries.length > 0) {
    url.searchParams.set("limitToCountries", options.limitToCountries.join(","));
  }
  if (options.lang) {
    url.searchParams.set("lang", options.lang);
  }
  if (options.includePoiCategories && options.includePoiCategories.length > 0) {
    url.searchParams.set(
      "includePoiCategories",
      options.includePoiCategories.join(",")
    );
  }
  if (options.excludePoiCategories && options.excludePoiCategories.length > 0) {
    url.searchParams.set(
      "excludePoiCategories",
      options.excludePoiCategories.join(",")
    );
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: options.signal,
  });

  if (response.status === 401 || response.status === 403) {
    // Token may have been revoked or the team identifier mismatched. Drop the
    // cache so the next call re-signs.
    cachedAccessToken = null;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Apple Maps Server API search failed: ${response.status} ${detail.slice(0, 200)}`
    );
  }

  return (await response.json()) as MapKitSearchResponse;
}

/** --- Directions (`/v1/directions`) --- */

export type AppleDirectionsTransportType =
  | "AUTOMOBILE"
  | "WALKING"
  | "TRANSIT"
  | "CYCLING";

export interface DirectionsCoordinate {
  latitude: number;
  longitude: number;
}

export interface DirectionsRouteDto {
  name?: string;
  distanceMeters?: number;
  durationSeconds?: number;
  transportType?: string;
  stepIndexes?: number[];
  hasTolls?: boolean;
}

export interface DirectionsStepDto {
  stepPathIndex?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  instructions?: string;
}

/** Raw JSON from `GET /v1/directions` (subset we consume). */
export interface DirectionsApiResponse {
  destination?: {
    name?: string;
    formattedAddressLines?: string[];
    center?: DirectionsCoordinate;
  };
  routes?: DirectionsRouteDto[];
  steps?: DirectionsStepDto[];
}

export interface NormalizedDirectionsStep {
  instructions?: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface NormalizedDirectionsRoute {
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  transportType: string;
  hasTolls: boolean;
  steps: NormalizedDirectionsStep[];
}

export interface GetDirectionsOptions {
  /** Origin: `"lat,lng"` or a free-text address (Apple resolves both). */
  origin: string;
  /** Destination: `"lat,lng"` or free-text. */
  destination: string;
  transportType?: AppleDirectionsTransportType;
  lang?: string;
  signal?: AbortSignal;
}

/**
 * Pick the first route with usable distance/duration and attach step text from
 * the global `steps` array via each route's `stepIndexes`.
 */
export function normalizeDirectionsResponse(
  data: DirectionsApiResponse | null | undefined
): NormalizedDirectionsRoute | null {
  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) {
    return null;
  }
  const allSteps = Array.isArray(data.steps) ? data.steps : [];
  for (const route of data.routes) {
    const dist =
      typeof route.distanceMeters === "number" ? route.distanceMeters : NaN;
    const dur =
      typeof route.durationSeconds === "number" ? route.durationSeconds : NaN;
    if (!Number.isFinite(dist) || !Number.isFinite(dur)) continue;

    const indexes = Array.isArray(route.stepIndexes) ? route.stepIndexes : [];
    const collected: NormalizedDirectionsStep[] = [];
    for (const idx of indexes) {
      if (typeof idx !== "number" || idx < 0 || idx >= allSteps.length) continue;
      const s = allSteps[idx];
      if (!s) continue;
      const dm =
        typeof s.distanceMeters === "number" ? s.distanceMeters : 0;
      const ds =
        typeof s.durationSeconds === "number" ? s.durationSeconds : 0;
      collected.push({
        instructions:
          typeof s.instructions === "string" ? s.instructions : undefined,
        distanceMeters: dm,
        durationSeconds: ds,
      });
    }

    return {
      name: typeof route.name === "string" && route.name.trim().length > 0
        ? route.name.trim()
        : "Route",
      distanceMeters: dist,
      durationSeconds: dur,
      transportType:
        typeof route.transportType === "string"
          ? route.transportType
          : "AUTOMOBILE",
      hasTolls: Boolean(route.hasTolls),
      steps: collected,
    };
  }
  return null;
}

/**
 * Request turn-by-turn directions from the Apple Maps Server API.
 *
 * @see https://developer.apple.com/documentation/applemapsserverapi/-v1-directions
 */
export async function getDirections(
  options: GetDirectionsOptions
): Promise<{
  raw: DirectionsApiResponse;
  route: NormalizedDirectionsRoute | null;
}> {
  const accessToken = await fetchAccessToken();
  const url = new URL(`${MAPS_API_HOST}/v1/directions`);
  url.searchParams.set("origin", options.origin.trim());
  url.searchParams.set("destination", options.destination.trim());
  if (options.transportType) {
    url.searchParams.set("transportType", options.transportType);
  }
  if (options.lang) {
    url.searchParams.set("lang", options.lang.trim());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: options.signal,
  });

  if (response.status === 401 || response.status === 403) {
    cachedAccessToken = null;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Apple Maps Server API directions failed: ${response.status} ${detail.slice(0, 200)}`
    );
  }

  const raw = (await response.json()) as DirectionsApiResponse;
  return { raw, route: normalizeDirectionsResponse(raw) };
}

/** Resolve the canonical POI category for a search hit. */
export function resolvePoiCategory(place: MapKitSearchPlace): string | undefined {
  return (
    place.poiCategory ||
    place.pointOfInterestCategory ||
    place.category ||
    undefined
  );
}
