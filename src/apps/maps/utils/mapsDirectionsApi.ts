export type MapsDirectionsTransportType =
  | "AUTOMOBILE"
  | "WALKING"
  | "TRANSIT"
  | "CYCLING";

export interface MapsDirectionsStep {
  instructions?: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface MapsDirectionsRoutePayload {
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  transportType: string;
  hasTolls: boolean;
  steps: MapsDirectionsStep[];
}

export interface MapsDirectionsDestinationPayload {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface MapsDirectionsSuccessResponse {
  success: true;
  routeAvailable: boolean;
  destination?: MapsDirectionsDestinationPayload;
  message?: string;
  route?: MapsDirectionsRoutePayload;
}

export interface MapsDirectionsErrorResponse {
  success: false;
  error: string;
  message?: string;
}

export type MapsDirectionsApiResponse =
  | MapsDirectionsSuccessResponse
  | MapsDirectionsErrorResponse;

const MAPS_DIRECTIONS_ENDPOINT = "/api/maps-directions";

export async function fetchMapsDirections(options: {
  origin: string;
  destination: string;
  transportType?: MapsDirectionsTransportType;
  lang?: string;
  signal?: AbortSignal;
}): Promise<MapsDirectionsApiResponse> {
  const res = await fetch(MAPS_DIRECTIONS_ENDPOINT, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      origin: options.origin,
      destination: options.destination,
      ...(options.transportType
        ? { transportType: options.transportType }
        : {}),
      ...(options.lang ? { lang: options.lang } : {}),
    }),
    signal: options.signal,
  });

  const data = (await res.json()) as MapsDirectionsApiResponse;
  if (!res.ok && !("success" in data)) {
    return {
      success: false,
      error: "http_error",
      message: `Directions request failed (${res.status})`,
    };
  }
  return data;
}
