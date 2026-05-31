import type { AppId } from "@/config/appRegistry";

/** Peak magnification multiplier at cursor center. */
export const DOCK_MAX_SCALE = 2.3;

/** Pixel range where dock magnification is applied. */
export const DOCK_MAGNIFY_DISTANCE = 140;

/** Base dock icon size in px (w-12). */
export const DOCK_BASE_BUTTON_SIZE = 48;

/** Apps that support multi-window from the dock. */
export const DOCK_MULTI_WINDOW_APPS: AppId[] = ["textedit", "finder", "applet-viewer"];
