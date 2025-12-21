/**
 * App-specific initial data types.
 * 
 * Provides type-safe initialData for each app that needs it.
 * This replaces the `unknown` type with discriminated unions.
 */

import type { AppId } from "@/config/appIds";

/** TextEdit initial data - for opening files */
export interface TextEditInitialData {
  path: string;
  content?: string;
}

/** Paint initial data - for opening image files */
export interface PaintInitialData {
  path: string;
  content: Blob;
}

/** Internet Explorer initial data - for URL navigation or share codes */
export interface InternetExplorerInitialData {
  url?: string;
  year?: string;
  shareCode?: string;
}

/** iPod initial data - for playing specific videos */
export interface IpodInitialData {
  videoId?: string;
}

/** Videos initial data - for playing specific videos */
export interface VideosInitialData {
  videoId?: string;
}

/** Applet Viewer initial data - for opening applets */
export interface AppletViewerInitialData {
  path?: string;
  content?: string;
  shareCode?: string;
  icon?: string;
  name?: string;
}

/** Finder initial data - for opening specific paths */
export interface FinderInitialData {
  path?: string;
}

/**
 * Map of app IDs to their initialData types.
 * Apps not in this map don't use initialData.
 */
export interface AppInitialDataMap {
  textedit: TextEditInitialData;
  paint: PaintInitialData;
  "internet-explorer": InternetExplorerInitialData;
  ipod: IpodInitialData;
  videos: VideosInitialData;
  "applet-viewer": AppletViewerInitialData;
  finder: FinderInitialData;
}

/**
 * Get the initialData type for a specific app.
 * Falls back to undefined for apps that don't use initialData.
 */
export type AppInitialData<T extends AppId> = T extends keyof AppInitialDataMap
  ? AppInitialDataMap[T]
  : undefined;

/**
 * Union type of all possible initialData types.
 * Useful when handling initialData generically.
 */
export type AnyAppInitialData =
  | TextEditInitialData
  | PaintInitialData
  | InternetExplorerInitialData
  | IpodInitialData
  | VideosInitialData
  | AppletViewerInitialData
  | FinderInitialData
  | undefined;

/**
 * Type guard to check if initialData is for TextEdit.
 */
export function isTextEditInitialData(
  data: unknown
): data is TextEditInitialData {
  return (
    typeof data === "object" &&
    data !== null &&
    "path" in data &&
    typeof (data as TextEditInitialData).path === "string"
  );
}

/**
 * Type guard to check if initialData is for Paint.
 */
export function isPaintInitialData(data: unknown): data is PaintInitialData {
  return (
    typeof data === "object" &&
    data !== null &&
    "path" in data &&
    "content" in data &&
    (data as PaintInitialData).content instanceof Blob
  );
}

/**
 * Type guard to check if initialData is for Internet Explorer.
 */
export function isInternetExplorerInitialData(
  data: unknown
): data is InternetExplorerInitialData {
  if (typeof data !== "object" || data === null) return false;
  const ie = data as InternetExplorerInitialData;
  return (
    ("url" in ie && typeof ie.url === "string") ||
    ("shareCode" in ie && typeof ie.shareCode === "string") ||
    ("year" in ie && typeof ie.year === "string")
  );
}

/**
 * Type guard to check if initialData is for iPod.
 */
export function isIpodInitialData(data: unknown): data is IpodInitialData {
  return (
    typeof data === "object" &&
    data !== null &&
    "videoId" in data &&
    typeof (data as IpodInitialData).videoId === "string"
  );
}

/**
 * Type guard to check if initialData is for Applet Viewer.
 */
export function isAppletViewerInitialData(
  data: unknown
): data is AppletViewerInitialData {
  if (typeof data !== "object" || data === null) return false;
  const av = data as AppletViewerInitialData;
  return (
    ("path" in av && typeof av.path === "string") ||
    ("content" in av && typeof av.content === "string") ||
    ("shareCode" in av && typeof av.shareCode === "string")
  );
}
