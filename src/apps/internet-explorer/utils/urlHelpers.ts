/**
 * Pure URL/title helpers for Internet Explorer.
 * Extracted from `useInternetExplorerLogic.ts` (no React / store dependencies).
 */

// Title truncation length for the IE window title.
export const MAX_TITLE_LENGTH = 50;

export const getHostnameFromUrl = (url: string): string => {
  try {
    const urlToUse = url.startsWith("http") ? url : `https://${url}`;
    return new URL(urlToUse).hostname;
  } catch {
    return url; // Return original if parsing fails
  }
};

export const formatTitle = (title: string): string => {
  if (!title) return "Internet Explorer";
  return title.length > MAX_TITLE_LENGTH
    ? title.substring(0, MAX_TITLE_LENGTH) + "..."
    : title;
};

/** Decode Base64 share-code data (compact `url|year` or JSON) on the client. */
export function decodeData(code: string): { url: string; year: string } | null {
  try {
    // Replace URL-safe characters back to standard Base64
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
    // Add padding if needed
    const paddedBase64 = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(paddedBase64);

    // Try compact format first (url|year)
    const [url, year] = decoded.split("|");
    if (typeof url === "string" && typeof year === "string") {
      return { url, year };
    }

    // If compact format fails, try JSON format
    try {
      const data = JSON.parse(decoded);
      if (typeof data.url === "string" && typeof data.year === "string") {
        return { url: data.url, year: data.year };
      }
    } catch {
      // Not every share code uses the JSON format; compact codes are handled above.
    }

    console.error("[IE] Decoded data structure invalid:", { url, year });
    return null;
  } catch (error) {
    console.error("[IE] Error decoding share code:", error);
    return null;
  }
}

/** Normalize URLs for history/caching (strip protocol + trailing slash). */
export const normalizeUrlForHistory = (url: string): string => {
  let normalized = url.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/$/, ""); // Remove trailing slash
  return normalized;
};
