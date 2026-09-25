import type { SavedPlace } from "../utils/types";
import { displayStationAddress, displayStationName } from "./parseStations";
import { youbikePinTitle } from "./stationVisuals";
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

type YouBikePoiPlace = {
  id?: string;
  name?: string;
  subtitle?: string;
  category?: string;
  youbike?: { bikesAvailable: number; totalDocks: number } | null;
} | null;

/**
 * Selected-dock MapKit marker copy. The balloon title is bikes/total;
 * the station name stays on the place card.
 */
export function youbikeMapPoiFields(place: YouBikePoiPlace): {
  title: string;
  subtitle: string;
  calloutEnabled: boolean;
} | null {
  if (!place || !isYouBikePlace(place) || !place.youbike) return null;
  return {
    title: youbikePinTitle(place.youbike),
    subtitle: "",
    calloutEnabled: false,
  };
}
