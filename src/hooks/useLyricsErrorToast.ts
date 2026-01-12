import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLatestRef } from "@/hooks/useLatestRef";

// =============================================================================
// Types
// =============================================================================

export interface UseLyricsErrorToastParams {
  /** Error message from lyrics fetch (undefined if no error) */
  error?: string;
  /** Current song ID */
  songId?: string;
  /** Callback when user clicks the Search action */
  onSearchClick: () => void;
  /** Translation function for i18n */
  t: (key: string, options?: { defaultValue: string }) => string;
  /** App identifier for translation keys (e.g., "ipod" or "karaoke") */
  appId?: "ipod" | "karaoke";
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Checks if an error is a "no lyrics" type error (not network/timeout errors).
 */
function isNoLyricsError(error: string): boolean {
  return (
    error.includes("No lyrics") ||
    error.includes("not found") ||
    error.includes("400") ||
    error.includes("No valid lyrics") ||
    error.includes("No lyrics source")
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Shows a toast notification when lyrics fetch fails with a "no lyrics" error.
 * 
 * Features:
 * - Only shows for "no lyrics" type errors (not network/timeout errors)
 * - Prevents duplicate toasts for the same song
 * - Includes a "Search" action button
 * - Automatically resets when song changes
 * 
 * @param params - Configuration including error, songId, and callbacks
 */
export function useLyricsErrorToast({
  error,
  songId,
  onSearchClick,
  t,
  appId = "ipod",
}: UseLyricsErrorToastParams): void {
  // Track last song ID we showed a toast for to avoid duplicates
  const lastErrorToastSongRef = useRef<string | null>(null);
  
  // Stable ref for callback to avoid effect re-runs when callers pass inline functions
  const onSearchClickRef = useLatestRef(onSearchClick);

  useEffect(() => {
    // Only show toast for "no lyrics" type errors
    const shouldShowToast = error && isNoLyricsError(error);

    // Show toast if we have a no-lyrics error and haven't shown one for this song yet
    if (shouldShowToast && songId && lastErrorToastSongRef.current !== songId) {
      lastErrorToastSongRef.current = songId;
      
      toast(t(`apps.${appId}.lyrics.noLyricsFound`, { defaultValue: "No lyrics found" }), {
        id: `lyrics-error-${songId}`,
        description: t(`apps.${appId}.lyrics.searchForLyrics`, { defaultValue: "Search for lyrics manually" }),
        action: {
          label: t(`apps.${appId}.lyrics.search`, { defaultValue: "Search" }),
          onClick: () => onSearchClickRef.current(),
        },
        duration: 5000,
      });
    }

    // Reset when song changes (and there's no error for the new song)
    if (songId !== lastErrorToastSongRef.current && !error) {
      lastErrorToastSongRef.current = null;
    }
  }, [error, songId, t, appId, onSearchClickRef]);
}
