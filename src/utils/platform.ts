/**
 * Platform detection utilities
 */

import { getAppPublicOrigin } from "@/utils/runtimeConfig";

/**
 * Check if the app is running in the Electron desktop shell.
 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "ryosDesktop" in window;
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
