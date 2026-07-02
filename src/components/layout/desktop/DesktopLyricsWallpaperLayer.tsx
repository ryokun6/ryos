import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useNowPlayingLyrics } from "@/hooks/useNowPlayingLyrics";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIpodPipActive } from "@/apps/ipod/hooks/useIpodPipActive";
import { useSaveSongCoverColor } from "@/hooks/useSaveSongCoverColor";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { KaraokeVisualLayers } from "@/apps/karaoke/components/karaoke-app/KaraokeVisualLayers";
import { DisplayMode } from "@/types/lyrics";
import { LyricsDisplay } from "@/apps/ipod/components/lyrics-display/LyricsDisplay";
import { usePublishNowPlayingCover } from "@/stores/useNowPlayingCoverBridge";

// Mirror the Karaoke fullscreen lyric sizing so the wallpaper renders large,
// viewport-relative lyrics (rather than the small in-app default).
const LYRICS_WALLPAPER_GAP = "clamp(0.2rem, calc(min(10vw, 10vh) * 0.08), 1rem)";

// Bottom clearance (px) so the lyrics sit above the dock / taskbar. Matches the
// PiP + toast bottom offsets used elsewhere so the lyrics line up with the rest
// of the desktop chrome. Aqua glass sits a little higher than classic Aqua.
const LYRICS_DOCK_CLEARANCE_GLASS = 82;
const LYRICS_DOCK_CLEARANCE_AQUA = 72;
const LYRICS_DOCK_CLEARANCE_WINDOWS = 42;
const LYRICS_DOCK_CLEARANCE_DEFAULT = 16;
// Lift the lyrics slightly off the dock/taskbar without pushing the block too
// high on the desktop.
const LYRICS_EXTRA_LIFT = 48;
// Extra clearance (px) when the iPod "pop player" (PiP) is showing: the floating
// player is ~64px tall and sits just above the dock, so lift the lyrics past it.
const LYRICS_PIP_CLEARANCE = 76;

// Mirror listen-sync thresholds so the muted wallpaper player tracks the
// primary iPod / Karaoke player without constant hard seeks.
const WALLPAPER_SOFT_SYNC_THRESHOLD_SEC = 0.5;
const WALLPAPER_HARD_SEEK_THRESHOLD_SEC = 3;
const WALLPAPER_SEEK_JUMP_THRESHOLD_SEC = 0.75;

export function LyricsWallpaperLayer() {
  const np = useNowPlayingLyrics();
  const videoPlayerRef = useRef<React.ComponentRef<typeof YouTubePlayer>>(null);
  const prevElapsedRef = useRef(np.elapsedSeconds);
  const prevTrackIdRef = useRef(np.track?.id);
  const wallpaperPlaybackRateRef = useRef(1);
  const { isMacOSTheme, isAquaGlass, isWinXp, isWin98 } = useThemeFlags();
  const pipActive = useIpodPipActive();
  // Persist the resolved cover color back to the song (and store) so the lyric
  // highlight color matches the song palette — exactly like the Karaoke overlay.
  const saveCoverColor = useSaveSongCoverColor(np.track);
  // Publish to the lightweight bridge for boot-path consumers (menubar tone).
  usePublishNowPlayingCover(np.coverUrl);

  // Reserve enough bottom space for the lyrics to clear the dock / taskbar, plus
  // the iPod pop player (PiP) when it's active. The offset differs for Aqua vs
  // Aqua Glass since the glass dock sits a touch higher.
  const containerStyle = useMemo<CSSProperties>(() => {
    const isWindowsTheme = isWinXp || isWin98;
    const dockClearance = isMacOSTheme
      ? isAquaGlass
        ? LYRICS_DOCK_CLEARANCE_GLASS
        : LYRICS_DOCK_CLEARANCE_AQUA
      : isWindowsTheme
        ? LYRICS_DOCK_CLEARANCE_WINDOWS
        : LYRICS_DOCK_CLEARANCE_DEFAULT;
    const paddingBottomPx =
      dockClearance +
      LYRICS_EXTRA_LIFT +
      (pipActive ? LYRICS_PIP_CLEARANCE : 0);
    return {
      gap: LYRICS_WALLPAPER_GAP,
      paddingLeft: "env(safe-area-inset-left, 0px)",
      paddingRight: "env(safe-area-inset-right, 0px)",
      paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${paddingBottomPx}px)`,
    };
  }, [isMacOSTheme, isAquaGlass, isWinXp, isWin98, pipActive]);

  const showVideoBackground =
    np.effectiveDisplayMode === DisplayMode.Video &&
    np.isPlaying &&
    np.track?.url &&
    np.track.source !== "appleMusic";

  useEffect(() => {
    if (!showVideoBackground) return;
    const player = videoPlayerRef.current;
    if (!player) return;

    const target = np.elapsedSeconds;
    if (np.track?.id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = np.track?.id;
      prevElapsedRef.current = target;
      wallpaperPlaybackRateRef.current = 1;
    }

    const prevElapsed = prevElapsedRef.current;
    const elapsedJump = Math.abs(target - prevElapsed);
    prevElapsedRef.current = target;

    const current = player.getCurrentTime() ?? 0;
    const drift = target - current;
    const absDrift = Math.abs(drift);

    const setPlaybackRate = (rate: number) => {
      if (wallpaperPlaybackRateRef.current === rate) return;
      try {
        const internalPlayer = player.getInternalPlayer() as
          | { playbackRate?: number }
          | null
          | undefined;
        if (
          internalPlayer &&
          typeof internalPlayer.playbackRate !== "undefined"
        ) {
          internalPlayer.playbackRate = rate;
          wallpaperPlaybackRateRef.current = rate;
        }
      } catch {
        // Some players don't support playbackRate.
      }
    };

    if (
      elapsedJump > WALLPAPER_SEEK_JUMP_THRESHOLD_SEC ||
      absDrift > WALLPAPER_HARD_SEEK_THRESHOLD_SEC ||
      (!np.isPlaying && absDrift > WALLPAPER_SOFT_SYNC_THRESHOLD_SEC)
    ) {
      player.seekTo(target, "seconds");
      setPlaybackRate(1);
      return;
    }

    if (np.isPlaying && absDrift > WALLPAPER_SOFT_SYNC_THRESHOLD_SEC) {
      setPlaybackRate(drift > 0 ? 1.05 : 0.95);
      return;
    }

    setPlaybackRate(1);
  }, [
    np.elapsedSeconds,
    np.isPlaying,
    np.track?.id,
    showVideoBackground,
  ]);

  return (
    <div className="absolute inset-0 w-full h-full z-[-10] overflow-hidden bg-neutral-950">
      {showVideoBackground && (
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <div className="w-full h-[calc(100%+400px)] mt-[-200px]">
            <YouTubePlayer
              ref={videoPlayerRef}
              url={np.track!.url}
              playing={np.isPlaying}
              volume={0}
              width="100%"
              height="100%"
              style={{ pointerEvents: "none" }}
              onReady={() => {
                wallpaperPlaybackRateRef.current = 1;
                videoPlayerRef.current?.seekTo(np.elapsedSeconds, "seconds");
              }}
              config={{
                youtube: {
                  playerVars: {
                    controls: 0,
                    fs: 0,
                  },
                },
              }}
            />
          </div>
        </div>
      )}
      <KaraokeVisualLayers
        effectiveDisplayMode={np.effectiveDisplayMode}
        visualBackgroundActive={np.visualBackgroundActive}
        currentTrack={np.track}
        coverUrl={np.coverUrl}
        isPlaying={np.isPlaying}
        layerClassName="absolute inset-0 w-full h-full"
        coverOverlayClassName="absolute inset-0"
        onCoverInteraction={() => {}}
      />
      {/* Soft darkening keeps the lyrics and desktop icons readable. */}
      <div className="absolute inset-0 w-full h-full bg-black/30" />
      {np.hasLyrics && (
        <LyricsDisplay
          lines={np.lyricsControls.lines}
          originalLines={np.lyricsControls.originalLines}
          currentLine={np.lyricsControls.currentLine}
          isLoading={np.lyricsControls.isLoading}
          error={np.lyricsControls.error}
          visible
          videoVisible
          fontClassName={np.lyricsFontClassName}
          isTranslating={np.lyricsControls.isTranslating}
          furiganaMap={np.furiganaMap}
          soramimiMap={np.soramimiMap}
          currentTimeMs={np.currentTimeMs}
          textSizeClass="fullscreen-lyrics-text"
          gapClass="gap-0"
          containerStyle={containerStyle}
          coverUrl={np.coverUrl}
          coverColor={np.track?.coverColor}
          onCoverColorResolved={saveCoverColor}
          showInterludeEllipsis
        />
      )}
    </div>
  );
}
