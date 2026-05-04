/**
 * MapKit JS groups colliding `MarkerAnnotation`s that share a
 * `clusteringIdentifier`. We only enable that identifier when the visible
 * region is wider than a city-scale viewport so street-level pins stay
 * separate.
 *
 * @see https://developer.apple.com/documentation/mapkitjs/clustering-annotations
 */

/** Shared cluster bucket for ryOS Home / Work / Favorites / search pins. */
export const RYOS_MAP_PLACES_CLUSTER_ID = "ryos.maps.places";

/**
 * When `max(latitudeDelta, longitudeDelta)` exceeds this value (~11 km at the
 * equator), treat the map as zoomed out past city level and allow clustering.
 * Boot default (0.12°) and regional search bias (≤0.5°) sit above this; focus
 * framing (0.012°) stays below.
 */
export const CITY_LEVEL_MAX_SPAN_DEG = 0.1;

export function shouldClusterMarkersForRegion(region: unknown): boolean {
  if (!region || typeof region !== "object") return false;
  const span = (region as { span?: { latitudeDelta?: number; longitudeDelta?: number } })
    .span;
  const lat = span?.latitudeDelta;
  const lng = span?.longitudeDelta;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  return Math.max(lat, lng) > CITY_LEVEL_MAX_SPAN_DEG;
}

export function clusteringIdentifierForRegion(region: unknown): string | null {
  return shouldClusterMarkersForRegion(region)
    ? RYOS_MAP_PLACES_CLUSTER_ID
    : null;
}

export function withMapPlaceClustering<T extends Record<string, unknown>>(
  options: T,
  clusteringIdentifier: string | null
): T & { clusteringIdentifier: string | null } {
  return { ...options, clusteringIdentifier };
}

const DEFAULT_CLUSTER_TITLE_NAME_COUNT = 4;

function memberAnnotationTitle(member: unknown): string {
  if (!member || typeof member !== "object") return "";
  const title = (member as { title?: string }).title;
  return typeof title === "string" ? title.trim() : "";
}

/**
 * Build a cluster callout title from member marker titles, e.g.
 * `Home, Garden, Cafe Nero, Library, +3`.
 */
export function formatClusterMarkerTitle(
  memberAnnotations: unknown[] | undefined,
  options?: { maxNames?: number }
): string {
  const maxNames = options?.maxNames ?? DEFAULT_CLUSTER_TITLE_NAME_COUNT;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const member of memberAnnotations ?? []) {
    const title = memberAnnotationTitle(member);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    names.push(title);
  }
  if (names.length === 0) return "";
  if (names.length <= maxNames) {
    return names.join(", ");
  }
  const head = names.slice(0, maxNames);
  const remaining = names.length - maxNames;
  return `${head.join(", ")}, +${remaining}`;
}
