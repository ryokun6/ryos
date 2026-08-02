import type { StuffStatus } from "../types";
import { stuffStatusLabelDefault } from "../types";

export interface StuffStatusRibbonStyle {
  background: string;
  color: string;
}

/** Ribbon colors per lifecycle status (readable on both light and dark covers). */
const STATUS_RIBBON_STYLES: Record<StuffStatus, StuffStatusRibbonStyle> = {
  in_use: { background: "#15803d", color: "#f0fdf4" },
  stowed: { background: "#475569", color: "#f8fafc" },
  for_sale: { background: "#c2410c", color: "#fff7ed" },
  reserved: { background: "#7e22ce", color: "#faf5ff" },
  sold: { background: "#1d4ed8", color: "#eff6ff" },
  discarded: { background: "#57534e", color: "#fafaf9" },
};

export function stuffStatusRibbonStyle(
  status: StuffStatus
): StuffStatusRibbonStyle {
  return STATUS_RIBBON_STYLES[status];
}

/** Ribbon text: for-sale items show asking price when set; otherwise status label. */
export function stuffStatusRibbonLabel(
  status: StuffStatus,
  price?: string | null
): string {
  if (status === "for_sale" && price) {
    return price;
  }
  return stuffStatusLabelDefault(status);
}
