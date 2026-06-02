import ReactPlayer from "react-player";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { WaterBackground } from "@/components/shared/WaterBackground";
import { DisplayMode } from "@/types/lyrics";
import { LyricsDisplay } from "../lyrics-display/LyricsDisplay";
import { getIpodSmallScreenLyricsFontClassName } from "../lyrics-display/useLyricsDisplaySettings";
import {
  AppleMusicPlayerBridge,
} from "../AppleMusicPlayerBridge";
import { StatusDisplay } from "../screen";
import {
  PLAYER_PROGRESS_INTERVAL_MS,
  IPOD_MODERN_SCREEN_HEIGHT_PX,
} from "../../constants";
import type { Track } from "@/stores/useIpodStore";
import { useIpodStore } from "@/stores/useIpodStore";
import type { IpodScreenProps } from "../../types";
import type { ActivityInfo } from "@/hooks/useActivityLabel";
import { useSaveSongCoverColor } from "@/hooks/useSaveSongCoverColor";

type SetAppleMusicKitNowPlaying = ReturnType<
  typeof useIpodStore.getState
>["setAppleMusicKitNowPlaying"];

export interface IpodScreenMediaOverlayProps {
  currentTrack: Track;
  menuMode: boolean;
  isCoverFlowOpen: boolean;
  showVideo: boolean;
  isPlaying: boolean;
  isFullScreen: boolean;
  isAppleMusicTrack: boolean;
  effectiveDisplayMode: DisplayMode;
  shouldAnimateVisuals: boolean;
  coverUrl: string | null;
  shouldShowLyrics: boolean;
  finalIpodVolume: number;
  elapsedTime: number;
  lyricOffset: number;
  statusMessage: string | null;
  isAnyActivityActive: boolean;
  activityState: ActivityInfo;
  uiVariant: "classic" | "modern";
  playerRef: IpodScreenProps["playerRef"];
  handleTrackEnd: IpodScreenProps["handleTrackEnd"];
  handleProgress: IpodScreenProps["handleProgress"];
  handleDuration: IpodScreenProps["handleDuration"];
  handlePlay: IpodScreenProps["handlePlay"];
  handlePause: IpodScreenProps["handlePause"];
  handleReady: IpodScreenProps["handleReady"];
  loopCurrent: boolean;
  onToggleVideo: () => void;
  registerActivity: () => void;
  setAppleMusicKitNowPlaying: SetAppleMusicKitNowPlaying;
  lyricsControls: IpodScreenProps["lyricsControls"];
  lyricsAlignment: IpodScreenProps["lyricsAlignment"];
  koreanDisplay: IpodScreenProps["koreanDisplay"];
  japaneseFurigana: IpodScreenProps["japaneseFurigana"];
  adjustLyricOffset: IpodScreenProps["adjustLyricOffset"];
  showStatusCallback: IpodScreenProps["showStatusCallback"];
  onNextTrack?: IpodScreenProps["onNextTrack"];
  onPreviousTrack?: IpodScreenProps["onPreviousTrack"];
  furiganaMap?: IpodScreenProps["furiganaMap"];
  soramimiMap?: IpodScreenProps["soramimiMap"];
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function IpodScreenMediaOverlay({
  currentTrack,
  menuMode,
  isCoverFlowOpen,
  showVideo,
  isPlaying,
  isFullScreen,
  isAppleMusicTrack,
  effectiveDisplayMode,
  shouldAnimateVisuals,
  coverUrl,
  shouldShowLyrics,
  finalIpodVolume,
  elapsedTime,
  lyricOffset,
  statusMessage,
  isAnyActivityActive,
  activityState,
  uiVariant,
  playerRef,
  handleTrackEnd,
  handleProgress,
  handleDuration,
  handlePlay,
  handlePause,
  handleReady,
  loopCurrent,
  onToggleVideo,
  registerActivity,
  setAppleMusicKitNowPlaying,
  lyricsControls,
  lyricsAlignment,
  koreanDisplay,
  japaneseFurigana,
  adjustLyricOffset,
  showStatusCallback,
  onNextTrack,
  onPreviousTrack,
  furiganaMap,
  soramimiMap,
  t,
}: IpodScreenMediaOverlayProps) {
  const saveCoverColor = useSaveSongCoverColor(currentTrack);

  return (
    <div
      className={cn(
        "absolute inset-0 transition-opacity duration-300 overflow-hidden",
        menuMode || isCoverFlowOpen ? "z-0" : "z-20",
        menuMode || !showVideo || isCoverFlowOpen
          ? "opacity-0 pointer-events-none"
          : "opacity-100"
      )}
    >
      <div
        className="w-full h-[calc(100%+300px)]"
        style={{ marginTop: -IPOD_MODERN_SCREEN_HEIGHT_PX }}
        onClick={(e) => {
          e.stopPropagation();
          registerActivity();
          if (!isPlaying) {
            if (!showVideo) {
              onToggleVideo();
              setTimeout(() => {
                handlePlay();
              }, 100);
            } else {
              handlePlay();
            }
          } else {
            onToggleVideo();
          }
        }}
      >
        {/* Player — swaps between YouTube (ReactPlayer) and Apple Music
            (MusicKit bridge) based on the active track's source. The
            YouTube embed is hidden when display mode is not Video, but
            still provides audio. */}
        {isAppleMusicTrack ? (
          <AppleMusicPlayerBridge
            ref={playerRef as unknown as React.RefObject<never>}
            currentTrack={currentTrack}
            playing={isPlaying && !isFullScreen}
            resumeAtSeconds={elapsedTime}
            volume={finalIpodVolume}
            onProgress={!isFullScreen ? handleProgress : undefined}
            onDuration={!isFullScreen ? handleDuration : undefined}
            onPlay={!isFullScreen ? handlePlay : undefined}
            onPause={!isFullScreen ? handlePause : undefined}
            onEnded={!isFullScreen ? handleTrackEnd : undefined}
            onReady={!isFullScreen ? handleReady : undefined}
            onNowPlayingItemChange={setAppleMusicKitNowPlaying}
          />
        ) : (
          <div
            className="size-full"
            style={
              effectiveDisplayMode !== DisplayMode.Video
                ? { visibility: "hidden", pointerEvents: "none" }
                : undefined
            }
          >
            <ReactPlayer
              ref={playerRef}
              url={currentTrack.url}
              playing={isPlaying}
              controls={
                showVideo && effectiveDisplayMode === DisplayMode.Video
              }
              width="100%"
              height="100%"
              onEnded={!isFullScreen ? handleTrackEnd : undefined}
              onProgress={!isFullScreen ? handleProgress : undefined}
              onDuration={!isFullScreen ? handleDuration : undefined}
              onPlay={!isFullScreen ? handlePlay : undefined}
              onPause={!isFullScreen ? handlePause : undefined}
              onReady={!isFullScreen ? handleReady : undefined}
              loop={loopCurrent}
              volume={finalIpodVolume}
              playsinline={true}
              progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
              config={{
                youtube: {
                  playerVars: {
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    iv_load_policy: 3,
                    fs: 0,
                    disablekb: 1,
                    playsinline: 1,
                    enablejsapi: 1,
                    origin: window.location.origin,
                  },
                  embedOptions: {
                    referrerPolicy: "strict-origin-when-cross-origin",
                  },
                },
              }}
            />
          </div>
        )}

        {/* Landscape video background */}
        {effectiveDisplayMode === DisplayMode.Landscapes && shouldAnimateVisuals && (
          <LandscapeVideoBackground
            isActive={shouldAnimateVisuals}
            className="absolute inset-0 z-[5]"
          />
        )}

        {/* Warp shader background */}
        {effectiveDisplayMode === DisplayMode.Shader && shouldAnimateVisuals && (
          <AmbientBackground
            coverUrl={coverUrl}
            variant="warp"
            isActive={shouldAnimateVisuals}
            className="absolute inset-0 z-[5]"
          />
        )}

        {/* Mesh gradient background */}
        {effectiveDisplayMode === DisplayMode.Mesh && shouldAnimateVisuals && (
          <MeshGradientBackground
            coverUrl={coverUrl}
            isActive={shouldAnimateVisuals}
            className="absolute inset-0 z-[5]"
          />
        )}

        {/* Water shader background */}
        {effectiveDisplayMode === DisplayMode.Water && shouldAnimateVisuals && (
          <WaterBackground
            coverUrl={coverUrl}
            isActive={shouldAnimateVisuals}
            className="absolute inset-0 z-[5]"
          />
        )}

        {/* Dark overlay when lyrics are shown */}
        {showVideo && shouldShowLyrics && (
          <div className="absolute inset-0 bg-black/30 z-25" />
        )}
        {/* Cover overlay: shows when paused (any mode) or in Cover mode.
            Apple Music still gets animated visualizers in non-cover modes. */}
        <AnimatePresence>
          {showVideo &&
            coverUrl &&
            (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
            <motion.div
              className="absolute inset-0 z-15"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={(e) => {
                e.stopPropagation();
                handlePlay();
              }}
            >
              {/* Single opacity animation (wrapper only) — nesting motion.img hid the overlay twice */}
              <img
                src={coverUrl}
                alt={currentTrack?.title}
                className="size-full object-cover brightness-50 pointer-events-none"
              />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Transparent overlay to capture clicks */}
        {showVideo && (
          <div
            className="absolute inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              if (!isPlaying) {
                handlePlay();
              } else {
                onToggleVideo();
              }
            }}
          />
        )}
        {/* Status Display */}
        <AnimatePresence>
          {statusMessage && (
            <motion.div
              className="absolute inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <StatusDisplay message={statusMessage} variant={uiVariant} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Activity Indicator */}
        <AnimatePresence>
          {isAnyActivityActive && (
            <motion.div
              className="absolute top-4 right-4 z-40 pointer-events-none"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
            >
              <ActivityIndicatorWithLabel
                size="md"
                state={activityState}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lyrics Overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 35 }}>
        <LyricsDisplay
          lines={lyricsControls.lines}
          originalLines={lyricsControls.originalLines}
          currentLine={lyricsControls.currentLine}
          isLoading={lyricsControls.isLoading}
          error={lyricsControls.error}
          visible={shouldShowLyrics}
          videoVisible={showVideo}
          fontClassName={getIpodSmallScreenLyricsFontClassName(uiVariant)}
          alignment={lyricsAlignment}
          koreanDisplay={koreanDisplay}
          japaneseFurigana={japaneseFurigana}
          isTranslating={lyricsControls.isTranslating}
          onAdjustOffset={(deltaMs) => {
            adjustLyricOffset(deltaMs);
            const newOffset = lyricOffset + deltaMs;
            const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
            showStatusCallback(
              `${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`
            );
            const updatedTime = elapsedTime + newOffset / 1000;
            lyricsControls.updateCurrentTimeManually(updatedTime);
          }}
          onSwipeUp={onNextTrack}
          onSwipeDown={onPreviousTrack}
          furiganaMap={furiganaMap}
          soramimiMap={soramimiMap}
          currentTimeMs={(elapsedTime + lyricOffset / 1000) * 1000}
          coverUrl={coverUrl}
          coverColor={currentTrack.coverColor}
          onCoverColorResolved={saveCoverColor}
        />
        </div>
      </div>
    </div>
  );
}
