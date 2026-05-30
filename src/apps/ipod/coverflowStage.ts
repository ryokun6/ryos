import { cn } from "@/lib/utils";

/**
 * Shared Cover Flow stage used by Karaoke and by iPod classic / fullscreen
 * surfaces. Visuals are isolated from OS chrome (System 7 / macOS / Windows)
 * so the black stage, label typography, and control buttons stay consistent.
 */
export const COVERFLOW_SHARED_STAGE_CLASS = "coverflow-shared-stage";

/** Root font scope for shared-stage Cover Flow (karaoke-force-font rules). */
export function coverFlowSharedStageRootClass(
  ipodMode: boolean,
  isModernIpodCoverFlow: boolean
): string {
  const sharedStage = !isModernIpodCoverFlow;
  if (!sharedStage) {
    return ipodMode ? "ipod-force-font" : "karaoke-force-font";
  }
  return cn(COVERFLOW_SHARED_STAGE_CLASS, "karaoke-force-font");
}

export function isCoverFlowSharedStage(isModernIpodCoverFlow: boolean): boolean {
  return !isModernIpodCoverFlow;
}

/** Label row font — Lucida Grande on macOS via font-os-ui. */
export function coverFlowLabelFontClass(
  isModernIpodCoverFlow: boolean
): string {
  return isModernIpodCoverFlow ? "font-ipod-modern-ui" : "font-os-ui";
}

export function coverFlowTitleTextClass(
  isModernIpodCoverFlow: boolean,
  ipodMode: boolean
): string {
  return cn(
    "truncate",
    isModernIpodCoverFlow
      ? "text-black text-[12px] font-semibold tracking-tight"
      : "text-white",
    ipodMode && !isModernIpodCoverFlow && "text-[10px]"
  );
}

export function coverFlowArtistTextClass(
  isModernIpodCoverFlow: boolean,
  ipodMode: boolean
): string {
  return cn(
    "truncate",
    isModernIpodCoverFlow
      ? "text-[10px] text-[rgb(99,101,103)] tracking-tight"
      : "text-white/60",
    ipodMode && !isModernIpodCoverFlow && "text-[8px]"
  );
}

export const COVERFLOW_SHARED_CONTROL_BUTTON_CLASS =
  "relative flex-shrink-0 rounded-full transition-all text-white/80 hover:text-white hover:brightness-110 p-3 os-native-chrome-skip";

export const COVERFLOW_SHARED_CONTROL_BUTTON_STYLE = {
  width: "clamp(40px, 8cqmin, 48px)",
  height: "clamp(40px, 8cqmin, 48px)",
  background: "rgba(255, 255, 255, 0.08)",
} as const;

export const COVERFLOW_SHARED_CONTROL_BUTTON_ACTIVE_STYLE = {
  ...COVERFLOW_SHARED_CONTROL_BUTTON_STYLE,
  background: "rgba(255, 255, 255, 0.15)",
} as const;

export const COVERFLOW_SHARED_FLOOR_GRADIENT =
  "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)";

export const COVERFLOW_MODERN_FLOOR_GRADIENT =
  "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.06) 78%, rgba(0,0,0,0.12) 100%)";

/** Responsive title/artist sizes for shared stage (window + fullscreen). */
export const COVERFLOW_SHARED_STAGE_TITLE_CLASS =
  "coverflow-shared-stage-title";

export const COVERFLOW_SHARED_STAGE_ARTIST_CLASS =
  "coverflow-shared-stage-artist";
