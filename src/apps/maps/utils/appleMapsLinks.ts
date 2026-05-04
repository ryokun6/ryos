export type AppleMapsDirectionsTravelMode =
  | "driving"
  | "walking"
  | "transit"
  | "cycling";

/** Maps ryOS travel mode UI to Apple unified-map `dirflg`. */
function dirflgForTravelMode(mode: AppleMapsDirectionsTravelMode): string {
  switch (mode) {
    case "walking":
      return "w";
    case "transit":
      return "r";
    case "cycling":
      return "k";
    case "driving":
    default:
      return "d";
  }
}

/**
 * Opens Apple Maps directions in the default Maps client (or browser).
 * Omitting `originLatitude` / `originLongitude` omits `saddr` so Maps can use
 * the user’s current location as the start when the client supports it.
 *
 * @see https://developer.apple.com/documentation/mapkit/unified-map-urls
 */
export function buildAppleMapsDirectionsUrl(options: {
  destinationLatitude: number;
  destinationLongitude: number;
  originLatitude?: number;
  originLongitude?: number;
  travelMode?: AppleMapsDirectionsTravelMode;
}): string {
  const params = new URLSearchParams({
    daddr: `${options.destinationLatitude},${options.destinationLongitude}`,
    dirflg: dirflgForTravelMode(options.travelMode ?? "driving"),
  });
  const olat = options.originLatitude;
  const olng = options.originLongitude;
  if (
    typeof olat === "number" &&
    Number.isFinite(olat) &&
    typeof olng === "number" &&
    Number.isFinite(olng)
  ) {
    params.set("saddr", `${olat},${olng}`);
  }
  return `https://maps.apple.com/?${params.toString()}`;
}

/** @deprecated Use {@link buildAppleMapsDirectionsUrl} with `travelMode: "driving"`. */
export function buildAppleMapsDrivingDirectionsUrl(
  latitude: number,
  longitude: number
): string {
  return buildAppleMapsDirectionsUrl({
    destinationLatitude: latitude,
    destinationLongitude: longitude,
    travelMode: "driving",
  });
}

/** Maps Apple Server API transport enum to unified Maps URL `dirflg`. */
export function appleTravelModeFromServerTransport(
  transport: "AUTOMOBILE" | "WALKING" | "TRANSIT" | "CYCLING"
): AppleMapsDirectionsTravelMode {
  switch (transport) {
    case "WALKING":
      return "walking";
    case "TRANSIT":
      return "transit";
    case "CYCLING":
      return "cycling";
    case "AUTOMOBILE":
    default:
      return "driving";
  }
}
