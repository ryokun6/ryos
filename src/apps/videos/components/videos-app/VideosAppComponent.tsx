import { type RefObject } from "react";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import type { AppProps, VideosInitialData } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { getTranslatedAppName } from "@/utils/i18n";
import { VideoFullScreenPortal } from "@/components/shared/VideoFullScreenPortal";
import { VideosAppDialogs } from "./VideosAppDialogs";
import { VideosCdPlayerControls } from "./VideosCdPlayerControls";
import { VideosVideoPane } from "./VideosVideoPane";
import { useVideosAppController } from "./useVideosAppController";

export function VideosAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<VideosInitialData>) {
  const c = useVideosAppController({
    isWindowOpen,
    onClose,
    isForeground,
    initialData,
    instanceId,
  });

  const {
    isXpTheme,
    isMacOSTheme,
    menuBar,
    shouldShowWhiteNoise,
    isFullScreen,
    getCurrentVideo,
    isPlaying,
    handlePlay,
    handlePause,
    togglePlay,
    handleVideoEnd,
    handleProgress,
    handleDuration,
    handleReady,
    loopCurrent,
    masterVolume,
    fullScreenPlayerRef,
    handleSeek,
    nextVideo,
    previousVideo,
    showStatus,
    statusMessage,
    isShuffled,
    toggleShuffle,
    toggleFullScreen,
    handleCloseFullScreen,
  } = c;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: getTranslatedAppName("videos"),
        onClose,
        isForeground,
        appId: "videos",
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        onFullscreenToggle: toggleFullScreen,
      }}
      trailing={
        isFullScreen && getCurrentVideo() ? (
          <VideoFullScreenPortal
            isOpen={isFullScreen}
            onClose={handleCloseFullScreen}
            url={getCurrentVideo()?.url || ""}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onTogglePlay={togglePlay}
            onEnded={handleVideoEnd}
            onProgress={handleProgress}
            onDuration={handleDuration}
            onReady={handleReady}
            loop={loopCurrent}
            volume={masterVolume}
            playerRef={fullScreenPlayerRef as RefObject<ReactPlayer>}
            onSeek={handleSeek}
            onNext={nextVideo}
            onPrevious={previousVideo}
            showStatus={showStatus}
            statusMessage={statusMessage}
            isShuffled={isShuffled}
            onToggleShuffle={toggleShuffle}
          />
        ) : null
      }
    >
      <div
        className={cn(
          "flex flex-col w-full h-full text-white",
          isMacOSTheme ? "bg-transparent" : "bg-[#1a1a1a]"
        )}
      >
        <div
          className="flex-1 relative overflow-hidden"
          style={
            isMacOSTheme
              ? {
                  border: "1px solid rgba(0, 0, 0, 0.55)",
                  boxShadow:
                    "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                }
              : undefined
          }
        >
          <VideosVideoPane c={c} shouldShowWhiteNoise={shouldShowWhiteNoise} />
        </div>
        <VideosCdPlayerControls c={c} />
      </div>
      <VideosAppDialogs c={c} />
    </AppWindowShell>
  );
}
