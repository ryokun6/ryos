/**
 * Platform detection utilities
 */

/**
 * Check if the app is running in Tauri (desktop app)
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Get the full API URL for a given path.
 * Automatically handles Tauri vs web differences.
 * @param path - API path (e.g., "/api/chat")
 * @returns Full URL (e.g., "https://os.ryo.lu/api/chat" in Tauri, "/api/chat" in web)
 */
export function getApiUrl(path: string): string {
  const baseUrl = isTauri() ? "https://os.ryo.lu" : "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

/**
 * Check if Tauri is running on Windows (Chromium) or Mac (WebKit)
 * @returns true if Windows (Chromium), false if Mac (WebKit) or not Tauri
 */
export function isTauriWindows(): boolean {
  if (!isTauri()) {
    return false;
  }
  
  if (typeof window === "undefined") {
    return false;
  }
  
  // Chromium detection: check for window.chrome object
  // On Windows, Tauri uses Chromium which has window.chrome
  // On Mac, Tauri uses WebKit which doesn't have window.chrome
  const hasChrome = "chrome" in window && (window as { chrome?: unknown }).chrome !== undefined;
  
  // If Chromium (has window.chrome), it's Windows
  // If WebKit (no window.chrome), it's Mac
  return hasChrome;
}

