import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useIpodStore,
  getActiveIpodCurrentTrack,
  getEffectiveTranslationLanguage,
  type Track,
} from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useListenSessionStore } from "@/stores/useListenSessionStore";
import {
  DisplayMode,
  getLyricsFontClassName,
  LyricsFont as LyricsFontEnum,
} from "@/types/lyrics";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useNowPlayingCover } from "@/hooks/useNowPlayingCover";

export interface NowPlayingLyrics {
  source: "ipod" | "karaoke" | null;
  isPlaying: boolean;
  track: Track | null;
  coverUrl: string | null;
  /** Live playback position used for word-level highlighting (ms). */
  currentTimeMs: number;
  /** Raw elapsed playback position (seconds, before lyric offset). */
  elapsedSeconds: number;
  lyricsControls: ReturnType<typeof useLyrics>;
  furiganaMap: ReturnType<typeof useFurigana>["furiganaMap"];
  soramimiMap: ReturnType<typeof useFurigana>["soramimiMap"];
  lyricsFontClassName: string;
  /** True when there are lyric lines to render for the active track. */
  hasLyrics: boolean;
  /** iPod / Karaoke View → Display mode for the active player (iPod when tied). */
  effectiveDisplayMode: DisplayMode;
  /** Shader / landscape / cover backgrounds animate only while playing in non-Video modes. */
  visualBackgroundActive: boolean;
}

/**
 * Resolves the now-playing track + synced lyrics for the `dynamic://lyrics`
 * wallpaper. Mirrors {@link useNowPlayingCover}'s precedence (actively playing
 * wins, iPod over Karaoke on ties; otherwise whichever has a current track) and
 * independently loads lyrics so the wallpaper works whether or not the iPod /
 * Karaoke windows are open.
 */
export function useNowPlayingLyrics(): NowPlayingLyrics {
  // iPod playback state.
  const ipodIsPlaying = useIpodStore((s) => s.isPlaying);
  const ipodLibrarySource = useIpodStore((s) => s.librarySource);
  const ipodCurrentSongId = useIpodStore((s) => s.currentSongId);
  const ipodAppleSongId = useIpodStore((s) => s.appleMusicCurrentSongId);
  const ipodTracks = useIpodStore((s) => s.tracks);
  const ipodAppleTracks = useIpodStore((s) => s.appleMusicTracks);
  const ipodElapsed = useIpodStore((s) => s.elapsedTime);

  // Karaoke playback state (library shared with the iPod's YouTube tracks).
  const karaokeIsPlaying = useKaraokeStore((s) => s.isPlaying);
  const karaokeSongId = useKaraokeStore((s) => s.currentSongId);
  const karaokeElapsed = useKaraokeStore((s) => s.elapsedTime);

  // Shared lyrics preferences live on the iPod store.
  const romanization = useIpodStore((s) => s.romanization);
  const lyricsTranslationLanguage = useIpodStore(
    (s) => s.lyricsTranslationLanguage
  );
  const lyricsFont = useIpodStore((s) => s.lyricsFont);
  const ipodDisplayMode = useIpodStore((s) => s.displayMode ?? DisplayMode.Video);
  const karaokeDisplayMode = useKaraokeStore(
    (s) => s.displayMode ?? DisplayMode.Video
  );

  const { listenSession, isListenSessionDj, isListenSessionAnonymous } =
    useListenSessionStore(
      useShallow((s) => ({
        listenSession: s.currentSession,
        isListenSessionDj: s.isDj,
        isListenSessionAnonymous: s.isAnonymous,
      }))
    );

  const cover = useNowPlayingCover();

  const { source, track, elapsed, isPlaying } = useMemo(() => {
    const ipodTrack = getActiveIpodCurrentTrack({
      librarySource: ipodLibrarySource,
      tracks: ipodTracks,
      currentSongId: ipodCurrentSongId,
      appleMusicTracks: ipodAppleTracks,
      appleMusicCurrentSongId: ipodAppleSongId,
    });
    const karaokeTrack = karaokeSongId
      ? ipodTracks.find((t) => t.id === karaokeSongId) ?? null
      : null;

    if (ipodIsPlaying)
      return {
        source: "ipod" as const,
        track: ipodTrack,
        elapsed: ipodElapsed,
        isPlaying: true,
      };
    if (karaokeIsPlaying)
      return {
        source: "karaoke" as const,
        track: karaokeTrack,
        elapsed: karaokeElapsed,
        isPlaying: true,
      };
    if (ipodTrack)
      return {
        source: "ipod" as const,
        track: ipodTrack,
        elapsed: ipodElapsed,
        isPlaying: false,
      };
    if (karaokeTrack)
      return {
        source: "karaoke" as const,
        track: karaokeTrack,
        elapsed: karaokeElapsed,
        isPlaying: false,
      };
    return {
      source: null as "ipod" | "karaoke" | null,
      track: null as Track | null,
      elapsed: 0,
      isPlaying: false,
    };
  }, [
    ipodIsPlaying,
    ipodLibrarySource,
    ipodCurrentSongId,
    ipodAppleSongId,
    ipodTracks,
    ipodAppleTracks,
    ipodElapsed,
    karaokeIsPlaying,
    karaokeSongId,
    karaokeElapsed,
  ]);

  const lyricOffsetMs = track?.lyricOffset ?? 0;
  const currentTime = elapsed + lyricOffsetMs / 1000;

  const effectiveTranslationLanguage = getEffectiveTranslationLanguage(
    lyricsTranslationLanguage
  );

  const selectedMatchForLyrics = useMemo(() => {
    const src = track?.lyricsSource;
    if (!src) return undefined;
    return {
      hash: src.hash,
      albumId: src.albumId,
      title: src.title,
      artist: src.artist,
      album: src.album,
    };
  }, [track?.lyricsSource]);

  const lyricsControls = useLyrics({
    songId: track?.id ?? "",
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    currentTime,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
    includeFurigana: true,
    includeSoramimi: true,
    soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
  });

  const { furiganaMap, soramimiMap } = useFurigana({
    songId: track?.id ?? "",
    lines: lyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    prefetchedInfo: lyricsControls.furiganaInfo,
    prefetchedSoramimiInfo: lyricsControls.soramimiInfo,
  });

  const lyricsFontClassName = getLyricsFontClassName(
    lyricsFont ?? LyricsFontEnum.GoldGlow
  );

  const displayMode =
    source === "karaoke" ? karaokeDisplayMode : ipodDisplayMode;
  const listenRemoteOnly =
    source === "karaoke" &&
    Boolean(
      listenSession && !isListenSessionDj && !isListenSessionAnonymous
    );
  const effectiveDisplayMode = listenRemoteOnly
    ? DisplayMode.Cover
    : source === "ipod" &&
        track?.source === "appleMusic" &&
        displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;
  const visualBackgroundActive =
    isPlaying &&
    !listenRemoteOnly &&
    effectiveDisplayMode !== DisplayMode.Video;

  return {
    source,
    isPlaying,
    track,
    coverUrl: cover.coverUrl,
    currentTimeMs: currentTime * 1000,
    elapsedSeconds: elapsed,
    lyricsControls,
    furiganaMap,
    soramimiMap,
    lyricsFontClassName,
    hasLyrics: lyricsControls.lines.length > 0,
    effectiveDisplayMode,
    visualBackgroundActive,
  };
}
