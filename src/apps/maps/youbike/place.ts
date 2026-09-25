import type { SavedPlace } from "../utils/types";
import { displayStationAddress, displayStationName } from "./parseStations";
import type { YouBikeStation } from "./types";

export function youbikeStationToSavedPlace(
  station: YouBikeStation,
  language: string | undefined
): SavedPlace {
  return {
    id: station.id,
    name: displayStationName(station, language),
    subtitle: displayStationAddress(station, language),
    latitude: station.latitude,
    longitude: station.longitude,
    category: "youbike",
    youbike: {
      stationId: station.stationId,
      city: station.city,
      bikesAvailable: station.bikesAvailable,
      docksAvailable: station.docksAvailable,
      totalDocks: station.totalDocks,
      isActive: station.isActive,
      updatedAt: station.updatedAt,
    },
  };
}

export function isYouBikePlace(place: { id?: string; category?: string; youbike?: unknown } | null): boolean {
  if (!place) return false;
  return place.category === "youbike" || !!place.youbike || (place.id?.startsWith("youbike:") ?? false);
}

/** Overlay docks already have a compact annotation — don't stack a named balloon. */
export function shouldDropNamedSearchPin(
  place: { id?: string; category?: string; youbike?: unknown } | null
): boolean {
  return !isYouBikePlace(place);
}
