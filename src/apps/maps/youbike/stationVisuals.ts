import { CITY_LEVEL_MAX_SPAN_DEG } from "../utils/mapMarkerClustering";
import {
  poiVisualGradient,
  type PoiVisual,
} from "../utils/poiVisuals";
import type { YouBikeStation } from "./types";

export const YOUBIKE_COLOR_AVAILABLE = "#7CB518";
export const YOUBIKE_COLOR_LOW = "#D97706";
export const YOUBIKE_COLOR_EMPTY = "#C2410C";
export const YOUBIKE_COLOR_INACTIVE = "#94a3b8";
export const YOUBIKE_WALK_STROKE = "#007aff";
export const YOUBIKE_BIKE_STROKE = "#7CB518";

export const YOUBIKE_POI_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: YOUBIKE_COLOR_AVAILABLE,
  to: "#4d7c0f",
};

const YOUBIKE_LOW_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: YOUBIKE_COLOR_LOW,
  to: "#92400e",
};

const YOUBIKE_EMPTY_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: YOUBIKE_COLOR_EMPTY,
  to: "#7f1d1d",
};

const YOUBIKE_INACTIVE_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: YOUBIKE_COLOR_INACTIVE,
  to: "#475569",
};

/** Brighter stops so docks stay readable on a dark MapKit basemap. */
const YOUBIKE_DARK_AVAILABLE_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: "#A3E635",
  to: "#4d7c0f",
};

const YOUBIKE_DARK_LOW_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: "#FBBF24",
  to: "#B45309",
};

const YOUBIKE_DARK_EMPTY_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: "#FB923C",
  to: "#9A3412",
};

const YOUBIKE_DARK_INACTIVE_VISUAL: PoiVisual = {
  iconKey: "Bicycle",
  from: "#E2E8F0",
  to: "#64748B",
};

export type YouBikeMapScheme = "light" | "dark";

export function youbikeMapScheme(isDarkMode: boolean): YouBikeMapScheme {
  return isDarkMode ? "dark" : "light";
}

/**
 * Hide docks at city-scale cameras (Taipei default 0.12°) and wider.
 * Same cutoff as saved-place clustering so street / neighborhood zoom paints.
 */
export const YOUBIKE_MAX_RENDER_SPAN_DEG = CITY_LEVEL_MAX_SPAN_DEG;

export function shouldRenderYouBikeOverlayForSpan(spanDeg: number): boolean {
  return Number.isFinite(spanDeg) && spanDeg <= YOUBIKE_MAX_RENDER_SPAN_DEG;
}

export function youbikeStationMarkerVisual(
  station: YouBikeStation,
  scheme: YouBikeMapScheme = "light"
): PoiVisual {
  const dark = scheme === "dark";
  if (!station.isActive) {
    return dark ? YOUBIKE_DARK_INACTIVE_VISUAL : YOUBIKE_INACTIVE_VISUAL;
  }
  if (station.bikesAvailable <= 0) {
    return dark ? YOUBIKE_DARK_EMPTY_VISUAL : YOUBIKE_EMPTY_VISUAL;
  }
  if (station.bikesAvailable <= 3) {
    return dark ? YOUBIKE_DARK_LOW_VISUAL : YOUBIKE_LOW_VISUAL;
  }
  return dark ? YOUBIKE_DARK_AVAILABLE_VISUAL : YOUBIKE_POI_VISUAL;
}

export function youbikeStationMarkerColor(
  station: YouBikeStation,
  scheme: YouBikeMapScheme = "light"
): string {
  return youbikeStationMarkerVisual(station, scheme).from;
}

export function youbikeStationMarkerGradient(
  station: YouBikeStation,
  scheme: YouBikeMapScheme = "light"
): string {
  return poiVisualGradient(youbikeStationMarkerVisual(station, scheme));
}

function clampDockCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Selected-pin label: bikes / total docks, never the station name. */
export function youbikePinTitle(station: {
  bikesAvailable: number;
  totalDocks: number;
}): string {
  const bikes = clampDockCount(station.bikesAvailable);
  const total = clampDockCount(station.totalDocks);
  return `${bikes}/${total}`;
}

export const YOUBIKE_DOT_SIZE_PX = 6;
export const YOUBIKE_DOT_SELECTED_SIZE_PX = 12;
export const YOUBIKE_DOT_DIM_SIZE_PX = 5;
export const YOUBIKE_DOT_DIM_OPACITY = "0.38";
/** Outer ring. Light basemap uses white; dark basemap uses a dark ring. */
export const YOUBIKE_DOT_OUTLINE_PX = 1.5;
export const YOUBIKE_DOT_OUTLINE_LIGHT = "#ffffff";
export const YOUBIKE_DOT_OUTLINE_DARK = "rgba(0, 0, 0, 0.72)";

/** How a dock should read while a YouBike route is (or isn't) on screen. */
export type YouBikeDotEmphasis = "normal" | "endpoint" | "dimmed";

/** Full chrome is reserved for route start / end docks. */
export function youbikeDotIsPrimary(emphasis: YouBikeDotEmphasis): boolean {
  return emphasis === "endpoint";
}

export function youbikeDotSizePx(emphasis: YouBikeDotEmphasis): number {
  if (emphasis === "endpoint") return YOUBIKE_DOT_SELECTED_SIZE_PX;
  if (emphasis === "dimmed") return YOUBIKE_DOT_DIM_SIZE_PX;
  return YOUBIKE_DOT_SIZE_PX;
}

export function youbikeDotFramePx(emphasis: YouBikeDotEmphasis): number {
  return youbikeDotSizePx(emphasis) + YOUBIKE_DOT_OUTLINE_PX * 2;
}

export function youbikeDotOpacity(emphasis: YouBikeDotEmphasis): string {
  return emphasis === "dimmed" ? YOUBIKE_DOT_DIM_OPACITY : "1";
}

export function youbikeDotOutlineColor(scheme: YouBikeMapScheme = "light"): string {
  return scheme === "light" ? YOUBIKE_DOT_OUTLINE_LIGHT : YOUBIKE_DOT_OUTLINE_DARK;
}

export function youbikeDotOutline(scheme: YouBikeMapScheme = "light"): string {
  return `${YOUBIKE_DOT_OUTLINE_PX}px solid ${youbikeDotOutlineColor(scheme)}`;
}

/** Hide only the tapped dock; the MapKit POI replaces it. Other docks stay. */
export function youbikeShouldPaintDot(
  stationId: string,
  options: {
    selectedYoubikeId?: string | null;
    endpointIds?: Iterable<string>;
  } = {}
): boolean {
  const selectedId = options.selectedYoubikeId ?? null;
  if (selectedId && stationId === selectedId) return false;
  return true;
}

export function createYouBikeDotElement(
  station: YouBikeStation,
  options: {
    selected?: boolean;
    emphasis?: YouBikeDotEmphasis;
    scheme?: YouBikeMapScheme;
  } = {}
): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  applyYouBikeDotAppearance(el, station, options);
  return el;
}

export function applyYouBikeDotAppearance(
  el: HTMLElement,
  station: YouBikeStation,
  options: {
    selected?: boolean;
    emphasis?: YouBikeDotEmphasis;
    scheme?: YouBikeMapScheme;
  } = {}
): void {
  const emphasis = options.emphasis ?? "normal";
  const scheme = options.scheme ?? "light";
  const primary = youbikeDotIsPrimary(emphasis);
  const size = youbikeDotSizePx(emphasis);
  const visual = youbikeStationMarkerVisual(station, scheme);
  el.style.boxSizing = "content-box";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.border = youbikeDotOutline(scheme);
  el.style.outline = "none";
  el.style.backgroundColor = visual.from;
  el.style.backgroundImage = poiVisualGradient(visual);
  el.style.backgroundClip = "padding-box";
  el.style.boxShadow = primary ? "0 1px 2px rgba(0,0,0,0.28)" : "none";
  el.style.opacity = youbikeDotOpacity(emphasis);
  el.style.pointerEvents = "auto";
}
