import { Bicycle } from "@phosphor-icons/react";
import phosphorFillPaths from "../utils/phosphorFillPaths.json";
import { buildGlyphHash } from "../utils/markerGlyphs";
import type { MapKitGlyphImage } from "../utils/poiMarkerStyle";
import type { YouBikeStation } from "./types";

export const YOUBIKE_COLOR_AVAILABLE = "#7CB518";
export const YOUBIKE_COLOR_LOW = "#D97706";
export const YOUBIKE_COLOR_EMPTY = "#C2410C";
export const YOUBIKE_COLOR_INACTIVE = "#94a3b8";
export const YOUBIKE_WALK_STROKE = "#007aff";
export const YOUBIKE_BIKE_STROKE = "#7CB518";

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

export function youbikeStationMarkerColor(station: YouBikeStation): string {
  if (!station.isActive) return YOUBIKE_COLOR_INACTIVE;
  if (station.bikesAvailable <= 0) return YOUBIKE_COLOR_EMPTY;
  if (station.bikesAvailable <= 3) return YOUBIKE_COLOR_LOW;
  return YOUBIKE_COLOR_AVAILABLE;
}

export function youbikeAvailabilityLabel(station: YouBikeStation): string {
  return `${station.bikesAvailable} · ${station.docksAvailable}`;
}

/** Short selected-pin label: bike count only, no station name. */
export function youbikePinTitle(station: YouBikeStation): string {
  const bikes = Number.isFinite(station.bikesAvailable)
    ? Math.max(0, Math.round(station.bikesAvailable))
    : 0;
  return String(bikes);
}

export const YOUBIKE_DOT_SIZE_PX = 10;
export const YOUBIKE_DOT_SELECTED_SIZE_PX = 12;
export const YOUBIKE_DOT_DIM_SIZE_PX = 6;
export const YOUBIKE_DOT_DIM_OPACITY = "0.38";
/** Hairline ring on the default / dimmed dots. */
export const YOUBIKE_DOT_BORDER_PX = 0.5;
export const YOUBIKE_DOT_SELECTED_BORDER_PX = 1;

/** How a dock should read while a YouBike route is (or isn't) on screen. */
export type YouBikeDotEmphasis = "normal" | "endpoint" | "dimmed";

export function youbikeDotSizePx(
  emphasis: YouBikeDotEmphasis,
  selected: boolean
): number {
  if (selected || emphasis === "endpoint") return YOUBIKE_DOT_SELECTED_SIZE_PX;
  if (emphasis === "dimmed") return YOUBIKE_DOT_DIM_SIZE_PX;
  return YOUBIKE_DOT_SIZE_PX;
}

export function youbikeDotBorderPx(
  emphasis: YouBikeDotEmphasis,
  selected: boolean
): number {
  if (selected || emphasis === "endpoint") return YOUBIKE_DOT_SELECTED_BORDER_PX;
  return YOUBIKE_DOT_BORDER_PX;
}

/** Hide the dense background dots while a YouBike dock is selected. */
export function youbikeShouldPaintDot(
  stationId: string,
  options: {
    selectedYoubikeId?: string | null;
    endpointIds?: Iterable<string>;
  } = {}
): boolean {
  const endpoints = new Set(options.endpointIds ?? []);
  if (endpoints.has(stationId)) return true;
  const selectedId = options.selectedYoubikeId ?? null;
  if (!selectedId) return true;
  return stationId === selectedId;
}

export function createYouBikeDotElement(
  color: string,
  options: { selected?: boolean; emphasis?: YouBikeDotEmphasis } = {}
): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  applyYouBikeDotAppearance(el, color, options);
  return el;
}

export function applyYouBikeDotAppearance(
  el: HTMLElement,
  color: string,
  options: { selected?: boolean; emphasis?: YouBikeDotEmphasis } = {}
): void {
  const selected = options.selected === true;
  const emphasis = options.emphasis ?? "normal";
  const primary = selected || emphasis === "endpoint";
  const size = youbikeDotSizePx(emphasis, selected);
  const borderPx = youbikeDotBorderPx(emphasis, selected);
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.backgroundColor = color;
  el.style.border = `${borderPx}px solid ${
    primary ? "#ffffff" : "rgba(255,255,255,0.85)"
  }`;
  el.style.boxSizing = "border-box";
  el.style.boxShadow = primary
    ? "0 1px 2px rgba(0,0,0,0.28)"
    : "none";
  el.style.opacity = !selected && emphasis === "dimmed" ? YOUBIKE_DOT_DIM_OPACITY : "1";
  el.style.pointerEvents = "auto";
}

export const YouBikeIcon = Bicycle;

export const YOUBIKE_POI_VISUAL = {
  iconKey: "Bicycle" as const,
  from: YOUBIKE_COLOR_AVAILABLE,
  to: "#4d7c0f",
};
