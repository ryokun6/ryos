/**
 * Opens Apple Maps driving directions in the default Maps client (or browser).
 * Omitting `saddr` uses the device’s current location as the start.
 *
 * @see https://developer.apple.com/documentation/mapkit/unified-map-urls
 */
export function buildAppleMapsDrivingDirectionsUrl(
  latitude: number,
  longitude: number
): string {
  const daddr = `${latitude},${longitude}`;
  const params = new URLSearchParams({
    daddr,
    dirflg: "d",
  });
  return `https://maps.apple.com/?${params.toString()}`;
}

/** Shape needed to build a “place” deep link (matches server `maps-executor` URLs). */
export interface AppleMapsPlaceLinkInput {
  latitude: number;
  longitude: number;
  name?: string | null;
  placeId?: string | null;
}

/**
 * Apple Maps unified URL for a place (coordinates + optional Apple Place ID).
 * Used when MapKit JS cannot show an in-app `PlaceDetail` (missing ID, lookup
 * errors, or very old MapKit builds).
 *
 * @see https://developer.apple.com/documentation/mapkit/unified-map-urls
 */
export function buildAppleMapsPlaceUrl(place: AppleMapsPlaceLinkInput): string {
  const url = new URL("https://maps.apple.com/");
  url.searchParams.set("ll", `${place.latitude},${place.longitude}`);
  const label = typeof place.name === "string" ? place.name.trim() : "";
  if (label) {
    url.searchParams.set("q", label);
  }
  if (place.placeId) {
    url.searchParams.set("place-id", place.placeId);
  }
  return url.toString();
}
