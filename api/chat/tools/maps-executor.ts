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
  const url = new URL("https://maps.apple.com/");
  if (place.coordinate) {
    url.searchParams.set(
      "ll",
      `${place.coordinate.latitude},${place.coordinate.longitude}`
    );
  }
  const label = place.name || fallbackLabel;
  if (label) {
    url.searchParams.set("q", label);
  }
  if (place.placeId) {
    url.searchParams.set("place-id", place.placeId);
  }
  return url.toString();
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

export async function executeMapsSearchPlaces(
  input: MapsSearchPlacesInput,
  context: ServerToolContext
): Promise<MapsSearchPlacesOutput> {
  const query = input.query.trim();
  context.log(
    `[mapsSearchPlaces] query="${query}" near=${
      input.near ? `${input.near.latitude},${input.near.longitude}` : "none"
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
      ...(input.near ? { searchLocation: input.near, userLocation: input.near } : {}),
      ...(input.region ? { searchRegion: input.region } : {}),
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
