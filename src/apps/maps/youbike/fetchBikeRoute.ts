import type { BikeRouteResult } from "./bikeRoute";
import type { GeoPoint } from "./types";

export async function fetchYouBikeBikeRoute(
  from: GeoPoint,
  to: GeoPoint,
  options?: { signal?: AbortSignal }
): Promise<BikeRouteResult | null> {
  const params = new URLSearchParams({
    fromLat: String(from.latitude),
    fromLng: String(from.longitude),
    toLat: String(to.latitude),
    toLng: String(to.longitude),
  });
  const response = await fetch(`/api/youbike/route?${params.toString()}`, {
    signal: options?.signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as Partial<BikeRouteResult>;
  if (!Array.isArray(data.path) || data.path.length < 8) return null;
  const steps = Array.isArray(data.steps)
    ? data.steps.flatMap((step) => {
        if (!step || typeof step.instruction !== "string") return [];
        return [
          {
            instruction: step.instruction,
            streetName: typeof step.streetName === "string" ? step.streetName : "",
            distanceMeters:
              typeof step.distanceMeters === "number" ? step.distanceMeters : 0,
            durationSeconds:
              typeof step.durationSeconds === "number" ? step.durationSeconds : 0,
          },
        ];
      })
    : [];
  return {
    path: data.path,
    distanceMeters:
      typeof data.distanceMeters === "number" ? data.distanceMeters : 0,
    durationSeconds:
      typeof data.durationSeconds === "number" ? data.durationSeconds : 0,
    provider: typeof data.provider === "string" ? data.provider : "osrm-bike",
    steps,
  };
}
