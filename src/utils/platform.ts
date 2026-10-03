/**
 * Platform detection utilities
 */

import { getAppPublicOrigin } from "@/utils/runtimeConfig";
import type {
  RyosDesktopApi,
  RyosDesktopCapabilities,
  RyosSideStatusBarExtentDetail,
} from "@/types/ryos-desktop";

/**
 * Check if a native shell (Electron, iOS wrapper, …) injected the
 * `window.ryosDesktop` bridge. This says nothing about which shell features
 * exist — use `getDesktopCapabilities()` for UI that assumes a desktop window.
 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "ryosDesktop" in window;
}

export type ResolvedDesktopCapabilities = Required<RyosDesktopCapabilities>;

const NO_DESKTOP_CAPABILITIES: ResolvedDesktopCapabilities = Object.freeze({
  windowChrome: false,
  windowShortcuts: false,
  selfUpdate: false,
});

const LEGACY_ELECTRON_CAPABILITIES: ResolvedDesktopCapabilities = Object.freeze({
  windowChrome: true,
  windowShortcuts: true,
  selfUpdate: true,
});

const ELECTRON_USER_AGENT = /\bElectron\//;

/**
 * Resolve which shell features the bridge provides. Explicit `capabilities`
 * win. Electron builds published before that field existed still load the
 * live web client, so a bridge without it is treated as Electron only when the
 * user agent says so (Electron's default UA carries `Electron/<version>`).
 */
export function resolveDesktopCapabilities(
  bridge: Pick<RyosDesktopApi, "capabilities"> | null | undefined,
  userAgent: string | null | undefined
): ResolvedDesktopCapabilities {
  if (!bridge) {
    return NO_DESKTOP_CAPABILITIES;
  }

  const declared = bridge.capabilities;
  if (declared && typeof declared === "object") {
    return {
      windowChrome: declared.windowChrome === true,
      windowShortcuts: declared.windowShortcuts === true,
      selfUpdate: declared.selfUpdate === true,
    };
  }

  return ELECTRON_USER_AGENT.test(userAgent ?? "")
    ? LEGACY_ELECTRON_CAPABILITIES
    : NO_DESKTOP_CAPABILITIES;
}

export function getDesktopCapabilities(): ResolvedDesktopCapabilities {
  if (typeof window === "undefined") {
    return NO_DESKTOP_CAPABILITIES;
  }
  return resolveDesktopCapabilities(
    window.ryosDesktop,
    typeof navigator === "undefined" ? null : navigator.userAgent
  );
}

/**
 * Whether the renderer sits in a frameless native desktop window (traffic
 * lights, drag regions, fullscreen events).
 */
export function hasDesktopWindowChrome(): boolean {
  return getDesktopCapabilities().windowChrome;
}

/**
 * Get the API base URL.
 * In the desktop shell, returns the production API URL.
 * In web browser, returns empty string for relative paths.
 */
export function getApiBaseUrl(): string {
  if (isDesktop()) {
    return getAppPublicOrigin();
  }
  return "";
}

/**
 * Get the full API URL for a given path.
 * Automatically handles desktop vs web differences.
 * @param path - API path (e.g., "/api/chat")
 * @returns Full URL (e.g., "https://os.ryo.lu/api/chat" in desktop, "/api/chat" in web)
 */
export function getApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Check if the desktop shell is running on Windows.
 */
export function isDesktopWindows(): boolean {
  if (!isDesktop()) {
    return false;
  }

  return window.ryosDesktop?.platform === "win32";
}

/** Attribute set on `<html>` while the native iOS shell is hosting the page. */
export const IOS_SHELL_ATTRIBUTE = "data-ios-shell";

/**
 * The ryOS iOS app injects `window.ryosDesktop` at document start with
 * `platform: "ios"`. Mobile Safari and desktop browsers do not. Safe-area
 * content insets are applied only for that shell; the browser already
 * handles its own safe areas.
 */
export function isIosShell(
  bridge: { platform?: string } | null | undefined = typeof window === "undefined"
    ? undefined
    : window.ryosDesktop
): boolean {
  return bridge?.platform === "ios";
}

/** Window event the iOS shell fires when the side status-bar cluster changes. */
export const SIDE_STATUS_BAR_EXTENT_EVENT = "ryos-status-bar-extent";

/** Root CSS variable that mirrors the iOS shell's `sideStatusBarExtent`. */
export const SIDE_BAR_EXTENT_VAR = "--side-bar-extent";

function applySideBarExtent(value: unknown): void {
  const px = Number(value);
  document.documentElement.style.setProperty(
    SIDE_BAR_EXTENT_VAR,
    `${Number.isFinite(px) && px > 0 ? px : 0}px`
  );
}

/**
 * Mark the document so CSS content insets apply, and mirror the side
 * status-bar extent into `--side-bar-extent`: read once here, then on every
 * `ryos-status-bar-extent` event as the device folds. No-op in a regular
 * browser.
 */
export function markIosShellDocument(): void {
  if (typeof document === "undefined" || !isIosShell()) return;
  document.documentElement.setAttribute(IOS_SHELL_ATTRIBUTE, "");
  applySideBarExtent(window.ryosDesktop?.sideStatusBarExtent);
  window.addEventListener(SIDE_STATUS_BAR_EXTENT_EVENT, (event) => {
    const detail = (event as CustomEvent<Partial<RyosSideStatusBarExtentDetail> | undefined>)
      .detail;
    applySideBarExtent(detail?.extent ?? window.ryosDesktop?.sideStatusBarExtent);
  });
}
