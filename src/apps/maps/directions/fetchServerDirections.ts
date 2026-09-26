import type { GeoPoint } from "../youbike/types";
import type { DirectionsMode, DirectionsRoutePlan } from "./types";

export async function fetchServerDirections(options: {
  from: GeoPoint;
  to: GeoPoint;
  mode: DirectionsMode;
  destinationLabel: string;
  signal?: AbortSignal;
}): Promise<DirectionsRoutePlan | null> {
  const params = new URLSearchParams({
    fromLat: String(options.from.latitude),
    fromLng: String(options.from.longitude),
    toLat: String(options.to.latitude),
    toLng: String(options.to.longitude),
    mode: options.mode,
    destinationLabel: options.destinationLabel,
  });
  const response = await fetch(`/api/maps/directions?${params.toString()}`, {
    signal: options.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Partial<DirectionsRoutePlan>;
  if (!Array.isArray(data.path) || data.path.length < 2) return null;
  return {
    mode: options.mode,
    origin: options.from,
    destination: options.to,
    destinationLabel: options.destinationLabel,
    path: data.path,
    distanceMeters: typeof data.distanceMeters === "number" ? data.distanceMeters : 0,
    durationSeconds:
      typeof data.durationSeconds === "number" ? data.durationSeconds : 0,
    steps: Array.isArray(data.steps) ? data.steps : [],
    provider: "maps-server",
  };
}
