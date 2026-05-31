import { IPOD_MODERN_TITLEBAR_HEIGHT_PX } from "../../constants";

// Shared cross-fade for cover images: stay invisible while
// loading (the wrapping element's gray background reads as the
// placeholder), then fade up to the loaded state in 250ms.
export const COVER_FADE_TRANSITION = "opacity 250ms ease-out" as const;

// Matches `MODERN_TITLEBAR_HEIGHT` in IpodScreen (shared constant).
export const MODERN_TITLEBAR_HEIGHT = IPOD_MODERN_TITLEBAR_HEIGHT_PX;

// Long press delay in milliseconds
export const LONG_PRESS_DELAY = 500;
