export const RYOS_DESKTOP_RELEASE_TAG = "desktop";
export const RYOS_DESKTOP_RELEASE_BASE_URL =
  "https://github.com/ryokun6/ryos/releases/download";

export type DesktopDownloadPlatform = "mac" | "windows" | "linux";

export interface DesktopDownloadOptions {
  platform: DesktopDownloadPlatform;
  arch?: string;
}

export interface DesktopDownloadRuntimeInfo {
  platform?: string | null;
  userAgent?: string | null;
  desktopPlatform?: string | null;
  maxTouchPoints?: number | null;
}

export interface SupportedDesktopDownloadTarget extends DesktopDownloadOptions {
  platform: "mac" | "windows";
  arch: "aarch64" | "x64";
  platformLabel: "Mac" | "Windows";
}

function getDesktopDownloadRuntimeInfo(): DesktopDownloadRuntimeInfo {
  const nav = typeof navigator === "undefined" ? null : navigator;

  return {
    platform: nav?.platform ?? null,
    userAgent: nav?.userAgent ?? null,
    desktopPlatform:
      typeof window === "undefined"
        ? null
        : window.ryosDesktop?.platform ?? null,
    maxTouchPoints: nav?.maxTouchPoints ?? null,
  };
}

function hasWindowsSignal(values: Array<string | null | undefined>): boolean {
  return values.some((value) => /win32|win64|windows|wow64/i.test(value ?? ""));
}

function hasMacSignal(values: Array<string | null | undefined>): boolean {
  return values.some((value) => /darwin|mac/i.test(value ?? ""));
}

// Phones/tablets can't run the Mac/Windows desktop build, yet their browsers
// still trip the Mac signal (iPhone UA contains "like Mac OS X", iPadOS reports
// as "Macintosh"). Treat those as mobile so we never offer a desktop download.
function isMobileRuntime(runtimeInfo: DesktopDownloadRuntimeInfo): boolean {
  // Running inside the native desktop shell is never mobile.
  if (runtimeInfo.desktopPlatform) {
    return false;
  }

  const values = [runtimeInfo.platform, runtimeInfo.userAgent];

  if (
    values.some((value) =>
      /iphone|ipad|ipod|android|blackberry|iemobile|opera mini|mobile|windows phone|kindle|silk/i.test(
        value ?? ""
      )
    )
  ) {
    return true;
  }

  // iPadOS 13+ presents a desktop ("Macintosh") UA but still exposes touch
  // points, which a real Mac does not.
  const maxTouchPoints = runtimeInfo.maxTouchPoints ?? 0;
  if (maxTouchPoints > 1 && hasMacSignal(values)) {
    return true;
  }

  return false;
}

export function getSupportedDesktopDownloadTarget(
  runtimeInfo: DesktopDownloadRuntimeInfo = getDesktopDownloadRuntimeInfo()
): SupportedDesktopDownloadTarget | null {
  if (isMobileRuntime(runtimeInfo)) {
    return null;
  }

  const values = [
    runtimeInfo.desktopPlatform,
    runtimeInfo.platform,
    runtimeInfo.userAgent,
  ];

  if (hasWindowsSignal(values)) {
    return {
      platform: "windows",
      arch: "x64",
      platformLabel: "Windows",
    };
  }

  if (hasMacSignal(values)) {
    return {
      platform: "mac",
      arch: "aarch64",
      platformLabel: "Mac",
    };
  }

  return null;
}

export function getDesktopDownloadAssetName(
  version: string,
  options: DesktopDownloadOptions
): string | null {
  if (options.platform === "mac" && options.arch === "aarch64") {
    return `ryOS_${version}_aarch64.dmg`;
  }

  if (options.platform === "windows" && options.arch === "x64") {
    return `ryOS_${version}_x64.exe`;
  }

  return null;
}

export function getDesktopDownloadUrl(
  version: string,
  options: DesktopDownloadOptions
): string | null {
  const assetName = getDesktopDownloadAssetName(version, options);
  if (!assetName) {
    return null;
  }

  return `${RYOS_DESKTOP_RELEASE_BASE_URL}/${RYOS_DESKTOP_RELEASE_TAG}/${assetName}`;
}
