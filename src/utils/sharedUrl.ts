import { getApiUrl, hasWindow } from "./platform";
import { abortableFetch } from "./abortableFetch";

/**
 * Decodes a shared URL code from the /share/{code} path
 */
export async function decodeSharedUrl(code: string): Promise<{ url: string; year: string } | null> {
  try {
    const response = await abortableFetch(
      getApiUrl(`/api/share-link?action=decode&code=${encodeURIComponent(code)}`),
      {
        method: "GET",
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      }
    );
    
    if (!response.ok) {
      console.error('Failed to decode shared URL:', await response.text());
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error decoding shared URL:', error);
    return null;
  }
}

/**
 * Extracts the code from a shared URL path
 */
export function extractCodeFromPath(path: string): string | null {
  // Match /internet-explorer/{code} pattern
  const match = path.match(/^\/internet-explorer\/([^/]+)$/);
  if (match) return match[1];
  
  // Match /applet-viewer/{code} pattern
  const appletMatch = path.match(/^\/applet-viewer\/([^/]+)$/);
  if (appletMatch) return appletMatch[1];
  
  return null;
}

/**
 * Generates a shareable URL for a specific app.
 * @param appId The ID of the app (e.g., 'internet-explorer', 'soundboard').
 * @returns The full shareable URL (e.g., 'https://hostname.com/internet-explorer').
 */
export function generateAppShareUrl(appId: string): string {
  return buildShareUrl(`/${appId}`, "app share URL");
}

/**
 * Generates a shareable URL for an applet using its share ID.
 * @param id The share ID of the applet.
 * @returns The full shareable URL (e.g., 'https://hostname.com/applet-viewer/{id}').
 */
export function generateAppletShareUrl(id: string): string {
  return buildShareUrl(`/applet-viewer/${id}`, "applet share URL");
}

function buildShareUrl(path: string, label: string): string {
  const origin = getWindowOrigin(label);
  return origin ? `${origin}${path}` : "";
}

function getWindowOrigin(label: string): string | null {
  if (!hasWindow()) {
    console.warn(`Cannot generate ${label}: window object is not available.`);
    return null;
  }
  return window.location.origin;
}