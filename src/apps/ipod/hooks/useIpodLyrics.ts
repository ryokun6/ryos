import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useActivityState } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";
import {
  useIpodStore,
  Track,
  getEffectiveTranslationLanguage,
  flushPendingLyricOffsetSave,
  isAppleMusicCollectionTrack,
} from "@/stores/useIpodStore";
import {
  resolveLyricsOverrideTargetId as resolveLyricsOverrideTargetIdHelper,
  resolveLyricsTrackMetadata,
} from "../utils/lyricsTrackMetadata";
import { LyricsAlignment, LyricsFont, getLyricsFontClassName } from "@/types/lyrics";
import { getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import { youtubeThumbnailUrl } from "@/utils/youtubeUrl";

export interface UseIpodLyricsOptions {
  tracks: Track[];
  currentIndex: number;
  elapsedTime: number;
  lyricsFont: LyricsFont;
  lyricsTranslationLanguage: string | null;
  romanization: ReturnType<typeof useIpodStore.getState>["romanization"];
  setCurrentFuriganaMap: (
    map: Record<string, import("@/utils/romanization").FuriganaSegment[]> | null
  ) => void;
  setTrackLyricsSource: (
    trackId: string,
    source: {
      hash: string;
      albumId: string | number;
      title: string;
      artist: string;
      album?: string;
    }
  ) => void;
  clearTrackLyricsSource: (trackId: string) => void;
  refreshLyrics: () => void;
  auth: { username: string; isAuthenticated: boolean } | undefined;
  showStatus: (message: string) => void;
  isAddingSong: boolean;
}

export function useIpodLyrics({
  tracks,
  currentIndex,
  elapsedTime,
  lyricsFont,
  lyricsTranslationLanguage,
  romanization,
  setCurrentFuriganaMap,
  setTrackLyricsSource,
  clearTrackLyricsSource,
  refreshLyrics,
  auth,
  showStatus,
  isAddingSong,
}: UseIpodLyricsOptions) {
  const { t, i18n } = useTranslation();
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);
  const [isSyncModeOpen, setIsSyncModeOpen] = useState(false);

  const lyricOffset = useIpodStore((s) => {
    const sourceTracks =
      s.librarySource === "appleMusic" ? s.appleMusicTracks : s.tracks;
    const sourceCurrentId =
      s.librarySource === "appleMusic"
        ? s.appleMusicCurrentSongId
        : s.currentSongId;
    const track = sourceCurrentId
      ? sourceTracks.find((t) => t.id === sourceCurrentId)
      : sourceTracks[0];
    return track?.lyricOffset ?? 0;
  });

  const currentTrack = tracks[currentIndex];
  const lyricsSourceOverride = currentTrack?.lyricsSource;

  const fullscreenCoverUrl = useMemo(() => {
    if (!currentTrack) return null;
    if (currentTrack.source === "appleMusic") {
      return currentTrack.cover ?? null;
    }
    const videoId = getYouTubeVideoId(currentTrack.url);
    const youtubeThumbnail = videoId ? youtubeThumbnailUrl(videoId) : null;
    return formatKugouImageUrl(currentTrack.cover, 800) ?? youtubeThumbnail;
  }, [currentTrack]);

  const handleRefreshLyrics = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) setIsLyricsSearchDialogOpen(true);
  }, [tracks, currentIndex]);

  const closeSyncMode = useCallback(async () => {
    const currentTrackId = tracks[currentIndex]?.id;
    if (currentTrackId) {
      await flushPendingLyricOffsetSave(currentTrackId);
    }
    setIsSyncModeOpen(false);
  }, [tracks, currentIndex]);

  const appleMusicKitNowPlaying = useIpodStore((s) => s.appleMusicKitNowPlaying);

    const resolveLyricsOverrideTargetId = useCallback(
      (): string | null =>
        resolveLyricsOverrideTargetIdHelper(
          tracks[currentIndex] ?? null,
          appleMusicKitNowPlaying
        ),
      [tracks, currentIndex, appleMusicKitNowPlaying]
    );

    const handleLyricsSearchSelect = useCallback(
      (result: { hash: string; albumId: string | number; title: string; artist: string; album?: string }) => {
        const targetId = resolveLyricsOverrideTargetId();
        if (targetId) {
          setTrackLyricsSource(targetId, result);
          refreshLyrics();
        }
      },
      [resolveLyricsOverrideTargetId, setTrackLyricsSource, refreshLyrics]
    );

    const handleLyricsSearchReset = useCallback(() => {
      const targetId = resolveLyricsOverrideTargetId();
      if (targetId) {
        clearTrackLyricsSource(targetId);
        refreshLyrics();
      }
    }, [resolveLyricsOverrideTargetId, clearTrackLyricsSource, refreshLyrics]);


    // Lyrics hook
    const selectedMatchForLyrics = useMemo(() => {
      if (!lyricsSourceOverride) return undefined;
      return {
        hash: lyricsSourceOverride.hash,
        albumId: lyricsSourceOverride.albumId,
        title: lyricsSourceOverride.title,
        artist: lyricsSourceOverride.artist,
        album: lyricsSourceOverride.album,
      };
    }, [lyricsSourceOverride]);

    // Resolve "auto" translation language to actual ryOS locale (must track i18n so UI updates when system language changes)
    const appLanguage = i18n.resolvedLanguage ?? i18n.language;
    const effectiveTranslationLanguage = useMemo(
      () => getEffectiveTranslationLanguage(lyricsTranslationLanguage),
      [lyricsTranslationLanguage, appLanguage]
    );
    // For Apple Music stations / playlists the iPod's `currentTrack` is
    // a *shell* — its title / artist describe the station or playlist
    // itself ("Today's Hits" / "Apple Music"), NOT the song that's
    // currently playing through it. Resolution lives in
    // `resolveLyricsTrackMetadata` so the rule is unit-tested in
    // isolation (see `tests/test-ipod-lyrics-track-metadata.test.ts`).
    const lyricsMetadata = useMemo(
      () => resolveLyricsTrackMetadata(currentTrack, appleMusicKitNowPlaying),
      [currentTrack, appleMusicKitNowPlaying]
    );
    const { title: lyricsTitle, artist: lyricsArtist, songId: lyricsSongId } =
      lyricsMetadata;

    const lyricsTimingOffsetMs = useMemo(() => {
      if (
        isAppleMusicCollectionTrack(currentTrack) &&
        appleMusicKitNowPlaying?.id
      ) {
        return 0;
      }
      return currentTrack?.lyricOffset ?? 0;
    }, [currentTrack, appleMusicKitNowPlaying?.id]);

    const fullScreenLyricsControls = useLyrics({
      songId: lyricsSongId,
      title: lyricsTitle,
      artist: lyricsArtist,
      currentTime: elapsedTime + lyricsTimingOffsetMs / 1000,
      translateTo: effectiveTranslationLanguage,
      selectedMatch: selectedMatchForLyrics,
      includeFurigana: true, // Fetch furigana info with lyrics to reduce API calls
      // Always include soramimi in request to avoid hydration timing issues
      // (default setting is false, but user's saved setting might be true after hydration)
      // The server only returns cached soramimi data, doesn't generate anything here
      includeSoramimi: true,
      // Pass target language so server returns correct cached soramimi data
      soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
      // Auth for force refresh / changing lyrics source
      auth,
    });

    // Show toast with Search button when lyrics fetch fails
    useLyricsErrorToast({
      error: fullScreenLyricsControls.error,
      songId: lyricsSongId || undefined,
      onSearchClick: () => setIsLyricsSearchDialogOpen(true),
      t,
      appId: "ipod",
    });

    // Fetch furigana for lyrics and store in shared state
    // Use pre-fetched info from lyrics request to skip extra API call
    const { 
      furiganaMap, 
      soramimiMap, 
      isFetchingFurigana,
      isFetchingSoramimi,
      furiganaProgress,
      soramimiProgress,
    } = useFurigana({
      songId: lyricsSongId,
      lines: fullScreenLyricsControls.originalLines,
      isShowingOriginal: true,
      romanization,
      prefetchedInfo: fullScreenLyricsControls.furiganaInfo,
      prefetchedSoramimiInfo: fullScreenLyricsControls.soramimiInfo,
      auth,
    });

    // Consolidated activity state for loading indicators
    const activityState = useActivityState({
      lyricsState: {
        isLoading: fullScreenLyricsControls.isLoading,
        isTranslating: fullScreenLyricsControls.isTranslating,
        translationProgress: fullScreenLyricsControls.translationProgress,
      },
      furiganaState: {
        isFetchingFurigana,
        furiganaProgress,
        isFetchingSoramimi,
        soramimiProgress,
      },
      translationLanguage: effectiveTranslationLanguage,
      isAddingSong,
    });

    // Convert furiganaMap to Record for storage - only when content actually changes
    const furiganaRecord = useMemo(() => {
      if (furiganaMap.size === 0) return null;
      const record: Record<string, import("@/utils/romanization").FuriganaSegment[]> = {};
      furiganaMap.forEach((value, key) => {
        record[key] = value;
      });
      return record;
    }, [furiganaMap]);

    // Ref to track last stored value to avoid redundant updates
    const lastFuriganaRecordRef = useRef<typeof furiganaRecord>(null);
    
    // Update shared store when furiganaMap changes
    useEffect(() => {
      // Skip if value hasn't actually changed (avoid unnecessary store updates)
      if (furiganaRecord === lastFuriganaRecordRef.current) return;
      lastFuriganaRecordRef.current = furiganaRecord;
      setCurrentFuriganaMap(furiganaRecord);
    }, [furiganaRecord, setCurrentFuriganaMap]);

    // Fullscreen callbacks
    const handleSelectTranslation = useCallback((code: string | null) => {
      useIpodStore.getState().setLyricsTranslationLanguage(code);
    }, []);

    const cycleAlignment = useCallback(() => {
      const store = useIpodStore.getState();
      const curr = store.lyricsAlignment;
      let next: LyricsAlignment;
      if (curr === LyricsAlignment.FocusThree) next = LyricsAlignment.Center;
      else if (curr === LyricsAlignment.Center) next = LyricsAlignment.Alternating;
      else next = LyricsAlignment.FocusThree;
      store.setLyricsAlignment(next);
      showStatus(
        next === LyricsAlignment.FocusThree
          ? t("apps.ipod.status.layoutFocus")
          : next === LyricsAlignment.Center
          ? t("apps.ipod.status.layoutCenter")
          : t("apps.ipod.status.layoutAlternating")
      );
    }, [showStatus, t]);

    const cycleLyricsFont = useCallback(() => {
      const store = useIpodStore.getState();
      const curr = store.lyricsFont;
      let next: LyricsFont;
      // Cycle: Rounded → Serif → SansSerif → SerifRed → Glow → Gradient → Rounded
      switch (curr) {
        case LyricsFont.Rounded: next = LyricsFont.Serif; break;
        case LyricsFont.Serif: next = LyricsFont.SansSerif; break;
        case LyricsFont.SansSerif: next = LyricsFont.SerifRed; break;
        case LyricsFont.SerifRed: next = LyricsFont.GoldGlow; break;
        case LyricsFont.GoldGlow: next = LyricsFont.Gradient; break;
        default: next = LyricsFont.Rounded;
      }
      store.setLyricsFont(next);
      
      const statusMessages: Record<LyricsFont, string> = {
        [LyricsFont.Rounded]: t("apps.ipod.status.fontRounded"),
        [LyricsFont.Serif]: t("apps.ipod.status.fontSerif"),
        [LyricsFont.SansSerif]: t("apps.ipod.status.fontSansSerif"),
        [LyricsFont.SerifRed]: t("apps.ipod.status.fontSerifRed"),
        [LyricsFont.GoldGlow]: t("apps.ipod.status.fontGoldGlow"),
        [LyricsFont.Gradient]: t("apps.ipod.status.fontGradient"),
      };
      showStatus(statusMessages[next]);
    }, [showStatus, t]);

  const lyricsFontClassName = getLyricsFontClassName(lyricsFont);

  return {
    lyricOffset,
    isLyricsSearchDialogOpen,
    setIsLyricsSearchDialogOpen,
    isSyncModeOpen,
    setIsSyncModeOpen,
    closeSyncMode,
    currentTrack,
    lyricsSourceOverride,
    fullscreenCoverUrl,
    fullScreenLyricsControls,
    furiganaMap,
    soramimiMap,
    effectiveTranslationLanguage,
    lyricsTitle,
    lyricsArtist,
    lyricsSongId,
    handleRefreshLyrics,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleSelectTranslation,
    cycleAlignment,
    cycleLyricsFont,
    lyricsFontClassName,
    activityState,
  };
}
