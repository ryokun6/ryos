import { getApiUrl } from "./platform";

/**
 * Decodes a shared URL code from the /share/{code} path
 */
export async function decodeSharedUrl(code: string): Promise<{ url: string; year: string } | null> {
  try {
    const response = await fetch(getApiUrl(`/api/share-link?action=decode&code=${encodeURIComponent(code)}`));
    
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
  if (typeof window === 'undefined') {
    // Handle server-side rendering or environments without window
    console.warn('Cannot generate app share URL: window object is not available.');
    return ''; // Or throw an error, depending on desired behavior
  }
  return `${window.location.origin}/${appId}`;
}

/**
 * Generates a shareable URL for an applet using its share ID.
 * @param id The share ID of the applet.
 * @returns The full shareable URL (e.g., 'https://hostname.com/applet-viewer/{id}').
 */
export function generateAppletShareUrl(id: string): string {
  if (typeof window === 'undefined') {
    console.warn('Cannot generate applet share URL: window object is not available.');
    return '';
  }
  return `${window.location.origin}/applet-viewer/${id}`;
} 