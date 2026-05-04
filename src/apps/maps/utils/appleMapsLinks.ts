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
