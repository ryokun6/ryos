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
 * Check if the app is running in a web browser
 */
export function isWeb(): boolean {
  return !isTauri();
}

/**
 * Get the API base URL.
 * In Tauri (desktop app), returns the production API URL.
 * In web browser, returns empty string for relative paths.
 */
export function getApiBaseUrl(): string {
  if (isTauri()) {
    return "https://os.ryo.lu";
  }
  return "";
}

/**
 * Get the full API URL for a given path.
 * Automatically handles Tauri vs web differences.
 * @param path - API path (e.g., "/api/chat")
 * @returns Full URL (e.g., "https://os.ryo.lu/api/chat" in Tauri, "/api/chat" in web)
 */
export function getApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

