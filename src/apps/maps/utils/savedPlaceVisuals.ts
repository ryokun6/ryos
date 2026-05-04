import type { PoiVisual } from "./poiVisuals";
import { HOME_GLYPH_IMAGE, WORK_GLYPH_IMAGE } from "./markerGlyphs";
/** Base hue for Home (badges and map pins). */
export const HOME_MARKER_COLOR = "#2563eb";

/** Base hue for Work — saturated warm amber (not muddy brown or pale tan). */
export const WORK_MARKER_COLOR = "#d97706";

/** Drawer / search-style badge; shallow gradient via `poiVisualGradient`. */
export const HOME_SAVED_VISUAL: PoiVisual = {
  iconKey: "House",
  from: HOME_MARKER_COLOR,
  to: "#1d4ed8",
};

export const WORK_SAVED_VISUAL: PoiVisual = {
  iconKey: "Briefcase",
  from: WORK_MARKER_COLOR,
  to: "#b45309",
};

export function homeMarkerAnnotationStyle(title: string, subtitle: string) {
  return {
    title,
    subtitle,
    color: HOME_MARKER_COLOR,
    glyphColor: "#ffffff",
    glyphImage: HOME_GLYPH_IMAGE,
    selectedGlyphImage: HOME_GLYPH_IMAGE,
    displayPriority: 1000,
    selected: false,
  };
}

export function workMarkerAnnotationStyle(title: string, subtitle: string) {
  return {
    title,
    subtitle,
    color: WORK_MARKER_COLOR,
    glyphColor: "#ffffff",
    glyphImage: WORK_GLYPH_IMAGE,
    selectedGlyphImage: WORK_GLYPH_IMAGE,
    displayPriority: 1000,
    selected: false,
  };
}
