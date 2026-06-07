import type { AppId } from "@/config/appRegistry";
import { STORES } from "@/utils/indexedDB";
import type { VfsDisplayFileItem } from "./types";

export type OpenWithLaunchApp = {
  kind: "launch-app";
  appId: AppId;
  initialData?: Record<string, unknown>;
};

export type OpenWithTextEdit = {
  kind: "textedit";
  path: string;
  content: string;
};

export type OpenWithPaint = {
  kind: "paint";
  path: string;
  content: string | Blob | undefined;
};

export type OpenWithAppletViewer = {
  kind: "applet-viewer";
  path: string;
  content: string;
};

export type OpenWithIpod = {
  kind: "ipod";
  songId: string;
};

export type OpenWithVideos = {
  kind: "videos";
  videoId: string;
};

export type OpenWithInternetExplorer = {
  kind: "internet-explorer";
  url: string;
  year: string;
};

export type OpenWithNavigate = {
  kind: "navigate";
  path: string;
};

export type OpenWithAliasApp = {
  kind: "alias-app";
  appId: AppId;
};

export type OpenWithTarget =
  | OpenWithLaunchApp
  | OpenWithTextEdit
  | OpenWithPaint
  | OpenWithAppletViewer
  | OpenWithIpod
  | OpenWithVideos
  | OpenWithInternetExplorer
  | OpenWithNavigate
  | OpenWithAliasApp;

export interface ResolveOpenWithInput {
  file: VfsDisplayFileItem;
  storeName: string | null;
  contentAsString?: string;
  contentToUse?: string | Blob;
}

/** Pure routing table for opening files in the appropriate app. */
export function resolveOpenWithTarget(
  input: ResolveOpenWithInput
): OpenWithTarget | null {
  const { file, storeName, contentAsString, contentToUse } = input;

  if (file.isDirectory) {
    if (file.type === "directory" || file.type === "directory-virtual") {
      return { kind: "navigate", path: file.path };
    }
    return null;
  }

  if (file.path.startsWith("/Applications/") && file.appId) {
    return { kind: "launch-app", appId: file.appId as AppId };
  }

  if (storeName === STORES.DOCUMENTS) {
    return {
      kind: "textedit",
      path: file.path,
      content: contentAsString ?? "",
    };
  }

  if (storeName === STORES.IMAGES) {
    return {
      kind: "paint",
      path: file.path,
      content: contentToUse,
    };
  }

  if (
    storeName === STORES.APPLETS &&
    (file.path.endsWith(".app") || file.path.endsWith(".html"))
  ) {
    return {
      kind: "applet-viewer",
      path: file.path,
      content: contentAsString ?? "",
    };
  }

  if (file.appId === "ipod" && file.data?.songId) {
    return { kind: "ipod", songId: file.data.songId };
  }

  if (file.appId === "videos" && file.data?.videoId) {
    return { kind: "videos", videoId: file.data.videoId };
  }

  if (file.type === "site-link" && file.data?.url) {
    return {
      kind: "internet-explorer",
      url: file.data.url,
      year: file.data.year || "current",
    };
  }

  return null;
}
