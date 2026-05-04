/**
 * Shared types for the Maps app.
 *
 * `SavedPlace` is the canonical shape used for anything we render or
 * persist about a place — search results, drawer entries, info card,
 * Home/Work, Favorites, Recents. Keeping it minimal makes it cheap to
 * serialize into the Zustand `persist` payload.
 */
export interface SavedPlace {
  id: string;
  name: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  /** MapKit `pointOfInterestCategory`, when known. */
  category?: string;
  /**
   * Apple Place ID (introduced in MapKit JS 5.78). Persisted alongside
   * the cached fields so we can later refresh stale data via
   * `mapkit.PlaceLookup.getPlace`. Optional because legacy entries and
   * geocoded coordinates from older sessions may not have an ID.
   *   https://developer.apple.com/documentation/mapkitjs/place/id
   */
  placeId?: string;
}
