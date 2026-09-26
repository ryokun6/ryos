import type { GeoPoint } from "../youbike/types";
import type { DirectionsMode } from "./types";

export type ExternalMapsTravelMode = DirectionsMode | "walk" | "cycle";

function coord(point: GeoPoint): string {
  return `${point.latitude},${point.longitude}`;
}

function appleDirflg(mode: ExternalMapsTravelMode | undefined): string {
  switch (mode) {
    case "transit":
      return "r";
    case "walk":
      return "w";
    case "cycle":
      return "b";
    case "drive":
    default:
      return "d";
  }
}

function googleTravelMode(mode: ExternalMapsTravelMode | undefined): string {
  switch (mode) {
    case "transit":
      return "transit";
    case "walk":
      return "walking";
    case "cycle":
      return "bicycling";
    case "drive":
    default:
      return "driving";
  }
}

/**
 * Apple Maps unified URL for driving (or another mode) to a destination.
 * Omitting `origin` lets the Maps client use the device location.
 */
export function buildAppleMapsDirectionsUrl(options: {
  destination: GeoPoint;
  origin?: GeoPoint | null;
  mode?: ExternalMapsTravelMode;
}): string {
  const params = new URLSearchParams({
    daddr: coord(options.destination),
    dirflg: appleDirflg(options.mode),
  });
  if (options.origin) {
    params.set("saddr", coord(options.origin));
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

/** Place pin in Apple Maps (no route). */
export function buildAppleMapsPlaceUrl(options: {
  latitude: number;
  longitude: number;
  name?: string;
}): string {
  const params = new URLSearchParams({
    ll: `${options.latitude},${options.longitude}`,
  });
  const query = options.name?.trim();
  if (query) params.set("q", query);
  return `https://maps.apple.com/?${params.toString()}`;
}

export function buildGoogleMapsDirectionsUrl(options: {
  destination: GeoPoint;
  origin?: GeoPoint | null;
  mode?: ExternalMapsTravelMode;
}): string {
  const params = new URLSearchParams({
    api: "1",
    destination: coord(options.destination),
    travelmode: googleTravelMode(options.mode),
  });
  if (options.origin) {
    params.set("origin", coord(options.origin));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsPlaceUrl(options: {
  latitude: number;
  longitude: number;
  name?: string;
}): string {
  const query = options.name?.trim();
  const params = new URLSearchParams({ api: "1" });
  params.set(
    "query",
    query
      ? `${query}@${options.latitude},${options.longitude}`
      : `${options.latitude},${options.longitude}`
  );
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function openExternalMapsUrl(url: string): void {
  if (typeof window === "undefined") return;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.assign(url);
}

/** @deprecated Prefer `buildAppleMapsDirectionsUrl`. Kept for existing callers/tests. */
export function buildAppleMapsDrivingDirectionsUrl(
  latitude: number,
  longitude: number
): string {
  return buildAppleMapsDirectionsUrl({
    destination: { latitude, longitude },
    mode: "drive",
  });
}
