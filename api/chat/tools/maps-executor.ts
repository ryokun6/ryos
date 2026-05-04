/**
 * Server-side executor for the `mapsSearchPlaces` tool.
 *
 * Backed by the Apple Maps Server API (`/v1/search`). Token signing and
 * caching live in `_mapkit-server.ts`.
 */

import {
  resolvePoiCategory,
  searchPlaces,
  type MapKitSearchPlace,
} from "../../_utils/_mapkit-server.js";
import { listMapKitMissingEnv } from "../../_utils/_mapkit-jwt.js";
import { buildAppleMapsPlaceUrl } from "../../src/apps/maps/utils/appleMapsLinks.js";
import type {
  MapsSearchPlaceResult,
  MapsSearchPlacesInput,
  MapsSearchPlacesOutput,
  ServerToolContext,
} from "./types.js";

const SEARCH_TIMEOUT_MS = 12_000;

function joinAddressLines(lines: string[] | undefined): string {
  if (!lines || lines.length === 0) return "";
  return lines
    .map((line) => (typeof line === "string" ? line.trim() : ""))
    .filter((line) => line.length > 0)
    .join(", ");
}

function buildAppleMapsUrl(
  place: MapKitSearchPlace,
  fallbackLabel: string
): string {
  const coord = place.coordinate;
  if (!coord || typeof coord.latitude !== "number" || typeof coord.longitude !== "number") {
    const url = new URL("https://maps.apple.com/");
    const label = place.name || fallbackLabel;
    if (label) url.searchParams.set("q", label);
    if (place.placeId) url.searchParams.set("place-id", place.placeId);
    return url.toString();
  }
  return buildAppleMapsPlaceUrl({
    latitude: coord.latitude,
    longitude: coord.longitude,
    name: place.name || fallbackLabel,
    placeId: place.placeId ?? null,
  });
}

function buildResult(
  place: MapKitSearchPlace,
  index: number,
  query: string
): MapsSearchPlaceResult | null {
  const coord = place.coordinate;
  if (!coord || typeof coord.latitude !== "number" || typeof coord.longitude !== "number") {
    return null;
  }

  const id =
    place.placeId ||
    `${coord.latitude.toFixed(5)},${coord.longitude.toFixed(5)},${index}`;

  const addressLines = Array.isArray(place.formattedAddressLines)
    ? place.formattedAddressLines
    : undefined;
  const address = joinAddressLines(addressLines);

  return {
    id,
    placeId: place.placeId,
    name: place.name || addressLines?.[0] || query,
    address,
    addressLines,
    latitude: coord.latitude,
    longitude: coord.longitude,
    category: resolvePoiCategory(place),
    country: place.country,
    countryCode: place.countryCode,
    appleMapsUrl: buildAppleMapsUrl(place, query),
  };
}

/**
 * Resolve a fallback search anchor from the request's IP-derived geolocation
 * when the model didn't pass an explicit `near`. Apple's `requestGeo` ships
 * latitude/longitude as strings on Vercel; we coerce to numbers and reject
 * obviously bogus values (NaN, out-of-range) so we don't make Apple complain.
 */
function resolveFallbackNear(
  context: ServerToolContext
): { latitude: number; longitude: number } | null {
  const geo = context.requestGeo;
  if (!geo) return null;
  const lat = typeof geo.latitude === "string" ? Number(geo.latitude) : geo.latitude;
  const lng = typeof geo.longitude === "string" ? Number(geo.longitude) : geo.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Treat a 0,0 anchor (Null Island) as "no signal" — Vercel sometimes ships
  // exactly that for unknown IPs and biasing every search toward the Gulf of
  // Guinea is worse than no bias at all.
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

export async function executeMapsSearchPlaces(
  input: MapsSearchPlacesInput,
  context: ServerToolContext
): Promise<MapsSearchPlacesOutput> {
  const query = input.query.trim();
  const explicitNear = input.near ?? null;
  const fallbackNear = explicitNear ? null : resolveFallbackNear(context);
  const effectiveNear = explicitNear ?? fallbackNear;
  const nearSource = explicitNear ? "input" : fallbackNear ? "request-ip" : "none";

  context.log(
    `[mapsSearchPlaces] query="${query}" near=${
      effectiveNear
        ? `${effectiveNear.latitude},${effectiveNear.longitude} (${nearSource})`
        : "none"
    } limit=${input.limit ?? 5}`
  );

  if (!query) {
    return {
      success: false,
      query,
      results: [],
      message: "Query is required.",
      error: "empty_query",
    };
  }

  const missing = listMapKitMissingEnv();
  if (missing.length > 0) {
    const message =
      "Apple Maps search is not configured. Missing environment: " +
      missing.join(", ");
    context.logError(`[mapsSearchPlaces] ${message}`);
    return {
      success: false,
      query,
      results: [],
      message,
      error: "mapkit_not_configured",
    };
  }

  const limit = input.limit ?? 5;

  try {
    const data = await searchPlaces({
      q: query,
      ...(effectiveNear
        ? { searchLocation: effectiveNear, userLocation: effectiveNear }
        : {}),
      ...(input.countries && input.countries.length > 0
        ? { limitToCountries: input.countries.map((c) => c.toUpperCase()) }
        : {}),
      ...(input.language ? { lang: input.language } : {}),
      // Bias toward POIs and addresses since the model's normal usage is
      // "find me X" — physical features and political boundaries tend to
      // produce noise in chat answers.
      resultTypeFilter: "Poi,Address",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });

    const places = Array.isArray(data.results) ? data.results : [];
    const results: MapsSearchPlaceResult[] = [];
    for (let i = 0; i < places.length && results.length < limit; i++) {
      const built = buildResult(places[i], i, query);
      if (built) {
        results.push(built);
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        query,
        results: [],
        message: `No places found for "${query}".`,
      };
    }

    return {
      success: true,
      query,
      results,
      message:
        results.length === 1
          ? `Found 1 place for "${query}".`
          : `Found ${results.length} places for "${query}".`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    context.logError(`[mapsSearchPlaces] Search failed`, error);
    return {
      success: false,
      query,
      results: [],
      message: `Map search failed: ${detail}`,
      error: detail,
    };
  }
}
