import { getApiUrl } from "./platform";
import { abortableFetch } from "./abortableFetch";

interface SongShareTrack {
  id: string;
  url?: string;
  title?: string;
  artist?: string;
  source?: "youtube" | "appleMusic";
  appleMusicPlayParams?: {
    catalogId?: string;
  };
}

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

function normalizeAppleMusicStorefront(
  storefrontId: string | null | undefined
): string {
  const normalized = storefrontId?.trim().toLowerCase();
  return normalized || "us";
}

function getAppleMusicCatalogId(track: SongShareTrack): string | null {
  const catalogId = track.appleMusicPlayParams?.catalogId?.trim();
  if (catalogId) return catalogId;

  const unprefixedId = track.id.startsWith("am:") ? track.id.slice(3) : track.id;
  return unprefixedId && !unprefixedId.startsWith("i.") ? unprefixedId : null;
}

/**
 * Generates the public Apple Music web URL for an Apple Music track.
 */
export function generateAppleMusicSongShareUrl(
  track: SongShareTrack,
  storefrontId?: string | null
): string {
  if (track.url?.startsWith("https://music.apple.com/")) {
    return track.url;
  }

  const storefront = normalizeAppleMusicStorefront(storefrontId);
  const catalogId = getAppleMusicCatalogId(track);
  if (catalogId) {
    return `https://music.apple.com/${storefront}/song/${encodeURIComponent(catalogId)}`;
  }

  const searchTerm = [track.title, track.artist]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (searchTerm) {
    return `https://music.apple.com/${storefront}/search?term=${encodeURIComponent(searchTerm)}`;
  }

  return `https://music.apple.com/${storefront}`;
}

/**
 * Generates a shareable URL for an iPod song. YouTube songs keep the ryOS
 * deep link; Apple Music songs should stay in Apple Music instead of creating
 * a shared ryOS song entry.
 */
export function generateIpodSongShareUrl(
  track: SongShareTrack,
  origin: string,
  appleMusicStorefrontId?: string | null
): string {
  if (track.source === "appleMusic") {
    return generateAppleMusicSongShareUrl(track, appleMusicStorefrontId);
  }

  return `${origin}/ipod/${encodeURIComponent(track.id)}`;
}

export function shouldCacheSongMetadataForShare(track: SongShareTrack): boolean {
  return track.source !== "appleMusic";
}