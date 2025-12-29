import { useMemo } from "react";
import type { ActivityInfo } from "@/hooks/useActivityLabel";

// =============================================================================
// Types
// =============================================================================

export interface UseLyricsState {
  isLoading: boolean;
  isTranslating: boolean;
  translationProgress?: number;
}

export interface UseFuriganaState {
  isFetchingFurigana: boolean;
  furiganaProgress?: number;
  isFetchingSoramimi: boolean;
  soramimiProgress?: number;
}

export interface UseActivityStateParams {
  /** State from useLyrics hook */
  lyricsState: UseLyricsState;
  /** State from useFurigana hook */
  furiganaState: UseFuriganaState;
  /** Effective translation language being used */
  translationLanguage?: string | null;
  /** Whether currently adding a song */
  isAddingSong?: boolean;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Consolidates loading states from useLyrics and useFurigana into a single ActivityInfo object.
 * 
 * This extracts the common pattern used in IpodAppComponent and KaraokeAppComponent
 * for building the activity state object that drives loading indicators.
 * 
 * @param params - State from lyrics and furigana hooks, plus additional context
 * @returns Consolidated ActivityInfo for loading indicators
 */
export function useActivityState({
  lyricsState,
  furiganaState,
  translationLanguage,
  isAddingSong = false,
}: UseActivityStateParams): ActivityInfo {
  const activityState: ActivityInfo = useMemo(
    () => ({
      isLoadingLyrics: lyricsState.isLoading,
      isTranslating: lyricsState.isTranslating,
      translationProgress: lyricsState.translationProgress,
      translationLanguage,
      isFetchingFurigana: furiganaState.isFetchingFurigana,
      furiganaProgress: furiganaState.furiganaProgress,
      isFetchingSoramimi: furiganaState.isFetchingSoramimi,
      soramimiProgress: furiganaState.soramimiProgress,
      isAddingSong,
    }),
    [
      lyricsState.isLoading,
      lyricsState.isTranslating,
      lyricsState.translationProgress,
      translationLanguage,
      furiganaState.isFetchingFurigana,
      furiganaState.furiganaProgress,
      furiganaState.isFetchingSoramimi,
      furiganaState.soramimiProgress,
      isAddingSong,
    ]
  );

  return activityState;
}

/**
 * Helper to check if any activity is currently in progress.
 * 
 * @param activityState - The consolidated activity state
 * @returns true if any loading activity is happening
 */
export function isAnyActivityActive(activityState: ActivityInfo): boolean {
  return !!(
    activityState.isLoadingLyrics ||
    activityState.isTranslating ||
    activityState.isFetchingFurigana ||
    activityState.isFetchingSoramimi ||
    activityState.isAddingSong
  );
}
