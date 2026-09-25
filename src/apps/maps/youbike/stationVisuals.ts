import { Bicycle } from "@phosphor-icons/react";
import phosphorFillPaths from "../utils/phosphorFillPaths.json";
import { buildGlyphHash } from "../utils/markerGlyphs";
import { CITY_LEVEL_MAX_SPAN_DEG } from "../utils/mapMarkerClustering";
import {
  poiVisualGradient,
  type PoiVisual,
} from "../utils/poiVisuals";
import type { MapKitGlyphImage } from "../utils/poiMarkerStyle";
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

/**
 * Hide docks at city-scale cameras (Taipei default 0.12°) and wider.
 * Same cutoff as saved-place clustering so street / neighborhood zoom paints.
 */
export const YOUBIKE_MAX_RENDER_SPAN_DEG = CITY_LEVEL_MAX_SPAN_DEG;

export function shouldRenderYouBikeOverlayForSpan(spanDeg: number): boolean {
  return Number.isFinite(spanDeg) && spanDeg <= YOUBIKE_MAX_RENDER_SPAN_DEG;
}

const BICYCLE_FILL_PATH =
  phosphorFillPaths.Bicycle ??
  "M54.46,164.71,82.33,126.5a48,48,0,1,1-12.92-9.44L41.54,155.29a8,8,0,1,0,12.92,9.42ZM208,112a47.81,47.81,0,0,0-16.93,3.09L214.91,156A8,8,0,1,1,201.09,164l-23.83-40.86A48,48,0,1,0,208,112ZM165.93,72H192a8,8,0,0,1,8,8,8,8,0,0,0,16,0,24,24,0,0,0-24-24H152a8,8,0,0,0-6.91,12l11.65,20H99.26L82.91,60A8,8,0,0,0,76,56H48a8,8,0,0,0,0,16H71.41L85.12,95.51,69.41,117.06a47.87,47.87,0,0,1,12.92,9.44l11.59-15.9L125.09,164A8,8,0,1,0,138.91,156l-30.32-52h57.48l11.19,19.17a48.11,48.11,0,0,1,13.81-8.08Z";

let bicycleGlyph: MapKitGlyphImage | null = null;

export function getYouBikeGlyphImage(): MapKitGlyphImage {
  if (!bicycleGlyph) {
    bicycleGlyph = buildGlyphHash(BICYCLE_FILL_PATH);
  }
  return bicycleGlyph;
}

export function youbikeStationMarkerVisual(station: YouBikeStation): PoiVisual {
  if (!station.isActive) return YOUBIKE_INACTIVE_VISUAL;
  if (station.bikesAvailable <= 0) return YOUBIKE_EMPTY_VISUAL;
  if (station.bikesAvailable <= 3) return YOUBIKE_LOW_VISUAL;
  return YOUBIKE_POI_VISUAL;
}

export function youbikeStationMarkerColor(station: YouBikeStation): string {
  return youbikeStationMarkerVisual(station).from;
}

export function youbikeStationMarkerGradient(station: YouBikeStation): string {
  return poiVisualGradient(youbikeStationMarkerVisual(station));
}

export function youbikeAvailabilityLabel(station: YouBikeStation): string {
  return `${station.bikesAvailable} · ${station.docksAvailable}`;
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
export const YOUBIKE_DOT_DIM_SIZE_PX = YOUBIKE_DOT_SIZE_PX;
export const YOUBIKE_DOT_DIM_OPACITY = "0.38";

/** How a dock should read while a YouBike route is (or isn't) on screen. */
export type YouBikeDotEmphasis = "normal" | "endpoint" | "dimmed";

/** Full chrome is reserved for route start / end docks. */
export function youbikeDotIsPrimary(emphasis: YouBikeDotEmphasis): boolean {
  return emphasis === "endpoint";
}

export function youbikeDotSizePx(emphasis: YouBikeDotEmphasis): number {
  return youbikeDotIsPrimary(emphasis)
    ? YOUBIKE_DOT_SELECTED_SIZE_PX
    : YOUBIKE_DOT_DIM_SIZE_PX;
}

export function youbikeDotOpacity(emphasis: YouBikeDotEmphasis): string {
  return youbikeDotIsPrimary(emphasis) ? "1" : YOUBIKE_DOT_DIM_OPACITY;
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
  options: { selected?: boolean; emphasis?: YouBikeDotEmphasis } = {}
): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  applyYouBikeDotAppearance(el, station, options);
  return el;
}

export function applyYouBikeDotAppearance(
  el: HTMLElement,
  station: YouBikeStation,
  options: { selected?: boolean; emphasis?: YouBikeDotEmphasis } = {}
): void {
  const emphasis = options.emphasis ?? "dimmed";
  const primary = youbikeDotIsPrimary(emphasis);
  const size = youbikeDotSizePx(emphasis);
  const visual = youbikeStationMarkerVisual(station);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.border = "none";
  el.style.outline = "none";
  el.style.boxSizing = "border-box";
  el.style.backgroundColor = visual.from;
  el.style.backgroundImage = poiVisualGradient(visual);
  el.style.boxShadow = primary ? "0 1px 2px rgba(0,0,0,0.28)" : "none";
  el.style.opacity = youbikeDotOpacity(emphasis);
  el.style.pointerEvents = "auto";
}

export const YouBikeIcon = Bicycle;
