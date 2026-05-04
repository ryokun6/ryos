import phosphorFillPaths from "./phosphorFillPaths.json";
import { getPoiVisual, type PoiIconKey } from "./poiVisuals";
import { buildGlyphHash } from "./markerGlyphs";

export type MapKitGlyphImage = { 1: string; 2: string; 3: string };

export interface PoiMarkerStyle {
  /** MapKit `MarkerAnnotation` balloon color (matches card gradient start). */
  color: string;
  glyphImage: MapKitGlyphImage;
}

const glyphByIcon = new Map<PoiIconKey, MapKitGlyphImage>();

/**
 * Marker balloon styling for a MapKit POI category — same phosphor icon and
 * gradient start color as the search list, place card, and drawer.
 */
export function getPoiMarkerStyle(
  category?: string | null
): PoiMarkerStyle {
  const visual = getPoiVisual(category);
  let glyphImage = glyphByIcon.get(visual.iconKey);
  if (!glyphImage) {
    const pathD = phosphorFillPaths[visual.iconKey];
    glyphImage = buildGlyphHash(pathD);
    glyphByIcon.set(visual.iconKey, glyphImage);
  }
  return { color: visual.from, glyphImage };
}

/** Options bag for `mapkit.MarkerAnnotation` using our POI styling. */
export function getPoiMarkerAnnotationOptions(
  title: string,
  subtitle: string,
  category?: string | null,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const { color, glyphImage } = getPoiMarkerStyle(category);
  return {
    title,
    subtitle,
    color,
    glyphColor: "#ffffff",
    glyphImage,
    selectedGlyphImage: glyphImage,
    ...extra,
  };
}
