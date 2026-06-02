import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { Suspense } from "react";
import type React from "react";
import { DisplayMode } from "@/types/lyrics";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { PLAYER_PROGRESS_INTERVAL_MS } from "../../constants";
import { AppleMusicPlayerBridge } from "../AppleMusicPlayerBridge";
import { FullScreenPortal } from "../FullScreenPortal";
import { LyricsDisplay } from "../lyrics-display/LyricsDisplay";
import { useSaveSongCoverColor } from "@/hooks/useSaveSongCoverColor";
import type { IpodAppController } from "./useIpodAppController";
import {
  AmbientBackground,
  LandscapeVideoBackground,
  MeshGradientBackground,
  WaterBackground,
} from "./ipodLazyImports";

type IpodFullScreenViewProps = {
  c: IpodAppController;
};

export function IpodFullScreenView({ c }: IpodFullScreenViewProps) {
  const {
    t,
    tracks,
    currentIndex,
    currentTrack,
    loopCurrent,
    isPlaying,
    isFullScreen,
    toggleFullScreen,
    togglePlay,
    skipOperationRef,
    startTrackSwitch,
    nextTrack,
    previousTrack,
    getCurrentStoreTrack,
    showStatus,
    showOfflineStatus,
    registerActivity,
    statusMessage,
    lyricsTranslationLanguage,
    handleSelectTranslation,
    lyricsAlignment,
    cycleAlignment,
    lyricsFont,
    cycleLyricsFont,
    romanization,
    setRomanization,
    setIsSyncModeOpen,
    isSyncModeOpen,
    effectiveDisplayMode,
    handleDisplayModeSelect,
    displayModeOptions,
    fullScreenLyricsControls,
    elapsedTime,
    totalTime,
    lyricOffset,
    furiganaMap,
    setLyricOffset,
    adjustLyricOffset,
    closeSyncMode,
    fullScreenPlayerRef,
    playerRef,
    activityState,
    finalIpodVolume,
    handleProgress,
    handleDuration,
    handlePlay,
    handlePause,
    handleReady,
    handleTrackEnd,
    setAppleMusicKitNowPlaying,
    shouldRenderFullScreenAnimatedVisuals,
    fullscreenCoverUrl,
    showLyrics,
    koreanDisplay,
    japaneseFurigana,
    soramimiMap,
    isOffline,
    seekToTime,
    seekTime,
  } = c;
  const saveCoverColor = useSaveSongCoverColor(currentTrack);

  if (!isFullScreen) return null;

  return (
    <FullScreenPortal
      onClose={() => toggleFullScreen()}
      togglePlay={togglePlay}
      nextTrack={() => {
        skipOperationRef.current = true;
        startTrackSwitch();
        nextTrack();
        const newTrack = getCurrentStoreTrack();
        if (newTrack) {
          const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
          showStatus(`⏭ ${newTrack.title}${artistInfo}`);
        }
      }}
      previousTrack={() => {
        skipOperationRef.current = true;
        startTrackSwitch();
        previousTrack();
        const newTrack = getCurrentStoreTrack();
        if (newTrack) {
          const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
          showStatus(`⏮ ${newTrack.title}${artistInfo}`);
        }
      }}
      seekTime={seekTime}
      showStatus={showStatus}
      showOfflineStatus={showOfflineStatus}
      registerActivity={registerActivity}
      isPlaying={isPlaying}
      statusMessage={statusMessage}
      currentTranslationCode={lyricsTranslationLanguage}
      onSelectTranslation={handleSelectTranslation}
      currentAlignment={lyricsAlignment}
      onCycleAlignment={cycleAlignment}
      currentLyricsFont={lyricsFont}
      onCycleLyricsFont={cycleLyricsFont}
      romanization={romanization}
      onRomanizationChange={setRomanization}
      onSyncMode={() => setIsSyncModeOpen((prev) => !prev)}
      isSyncModeOpen={isSyncModeOpen}
      displayMode={effectiveDisplayMode}
      onDisplayModeSelect={handleDisplayModeSelect}
      displayModeOptions={displayModeOptions}
      syncModeContent={
        fullScreenLyricsControls.originalLines.length > 0 ? (
          <LyricsSyncMode
            lines={fullScreenLyricsControls.originalLines}
            currentTimeMs={elapsedTime * 1000}
            durationMs={totalTime * 1000}
            currentOffset={lyricOffset}
            romanization={romanization}
            furiganaMap={furiganaMap}
            onSetOffset={(offsetMs) => {
              setLyricOffset(currentIndex, offsetMs);
              showStatus(
                `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
              );
            }}
            onAdjustOffset={(deltaMs) => {
              adjustLyricOffset(currentIndex, deltaMs);
              const newOffset = lyricOffset + deltaMs;
              showStatus(
                `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
              );
            }}
            onSeek={(timeMs) => {
              const activePlayer = isFullScreen
                ? fullScreenPlayerRef.current
                : playerRef.current;
              activePlayer?.seekTo(timeMs / 1000);
            }}
            onClose={closeSyncMode}
          />
        ) : undefined
      }
      fullScreenPlayerRef={fullScreenPlayerRef}
      activityState={activityState}
    >
      {({ controlsVisible }) => (
        <div className="flex flex-col w-full h-full">
          <div className="relative w-full h-full overflow-hidden">
            <div
              className="absolute inset-0 w-full h-full"
              style={
                effectiveDisplayMode !== DisplayMode.Video
                  ? { visibility: "hidden", pointerEvents: "none" }
                  : undefined
              }
            >
              <div
                className="w-full absolute"
                style={{
                  height: "calc(100% + clamp(480px, 60dvh, 800px))",
                  top: "calc(clamp(240px, 30dvh, 400px) * -1)",
                }}
              >
                {tracks[currentIndex] && (
                  <div className="w-full h-full pointer-events-none">
                    {tracks[currentIndex].source === "appleMusic" ? (
                      <AppleMusicPlayerBridge
                        ref={
                          fullScreenPlayerRef as unknown as React.RefObject<never>
                        }
                        currentTrack={tracks[currentIndex]}
                        playing={isPlaying && isFullScreen}
                        resumeAtSeconds={elapsedTime}
                        volume={finalIpodVolume}
                        onProgress={handleProgress}
                        onDuration={handleDuration}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onEnded={handleTrackEnd}
                        onReady={handleReady}
                        onNowPlayingItemChange={setAppleMusicKitNowPlaying}
                      />
                    ) : (
                      <ReactPlayer
                        ref={fullScreenPlayerRef}
                        url={tracks[currentIndex].url}
                        playing={isPlaying && isFullScreen}
                        controls
                        width="100%"
                        height="100%"
                        volume={finalIpodVolume}
                        loop={loopCurrent}
                        onEnded={handleTrackEnd}
                        onProgress={handleProgress}
                        onDuration={handleDuration}
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onReady={handleReady}
                        config={{
                          youtube: {
                            playerVars: {
                              modestbranding: 1,
                              rel: 0,
                              showinfo: 0,
                              iv_load_policy: 3,
                              cc_load_policy: 0,
                              fs: 1,
                              playsinline: 1,
                              enablejsapi: 1,
                              origin: window.location.origin,
                            },
                            embedOptions: {
                              referrerPolicy: "strict-origin-when-cross-origin",
                            },
                          },
                        }}
                        progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {effectiveDisplayMode === DisplayMode.Landscapes &&
              shouldRenderFullScreenAnimatedVisuals &&
              tracks[currentIndex] && (
                <Suspense fallback={null}>
                  <LandscapeVideoBackground
                    isActive={shouldRenderFullScreenAnimatedVisuals}
                    className="fixed inset-0 z-[5]"
                  />
                </Suspense>
              )}

            {effectiveDisplayMode === DisplayMode.Shader &&
              shouldRenderFullScreenAnimatedVisuals &&
              tracks[currentIndex] && (
                <Suspense fallback={null}>
                  <AmbientBackground
                    coverUrl={fullscreenCoverUrl}
                    variant="warp"
                    isActive={shouldRenderFullScreenAnimatedVisuals}
                    className="fixed inset-0 z-[5]"
                  />
                </Suspense>
              )}

            {effectiveDisplayMode === DisplayMode.Mesh &&
              shouldRenderFullScreenAnimatedVisuals &&
              tracks[currentIndex] && (
                <Suspense fallback={null}>
                  <MeshGradientBackground
                    coverUrl={fullscreenCoverUrl}
                    isActive={shouldRenderFullScreenAnimatedVisuals}
                    className="fixed inset-0 z-[5]"
                  />
                </Suspense>
              )}

            {effectiveDisplayMode === DisplayMode.Water &&
              shouldRenderFullScreenAnimatedVisuals &&
              tracks[currentIndex] && (
                <Suspense fallback={null}>
                  <WaterBackground
                    coverUrl={fullscreenCoverUrl}
                    isActive={shouldRenderFullScreenAnimatedVisuals}
                    className="fixed inset-0 z-[5]"
                  />
                </Suspense>
              )}

            <AnimatePresence>
              {tracks[currentIndex] &&
                fullscreenCoverUrl &&
                (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
                  <motion.div
                    className="fixed inset-0 z-15"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                  >
                    <motion.img
                      src={fullscreenCoverUrl}
                      alt={tracks[currentIndex]?.title}
                      className="w-full h-full object-cover brightness-50 pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    />
                  </motion.div>
                )}
            </AnimatePresence>

            {showLyrics && tracks[currentIndex] && (
              <div className="fixed inset-0 bg-black/50 z-10 pointer-events-none" />
            )}

            {showLyrics && tracks[currentIndex] && (
              <div className="absolute inset-0 z-20 pointer-events-none" data-lyrics>
                <LyricsDisplay
                  lines={fullScreenLyricsControls.lines}
                  originalLines={fullScreenLyricsControls.originalLines}
                  currentLine={fullScreenLyricsControls.currentLine}
                  isLoading={fullScreenLyricsControls.isLoading}
                  error={fullScreenLyricsControls.error}
                  visible={true}
                  videoVisible={true}
                  alignment={lyricsAlignment}
                  koreanDisplay={koreanDisplay}
                  japaneseFurigana={japaneseFurigana}
                  onAdjustOffset={(delta) => {
                    adjustLyricOffset(currentIndex, delta);
                    const newOffset = (tracks[currentIndex]?.lyricOffset ?? 0) + delta;
                    const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                    showStatus(
                      `${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`
                    );
                    fullScreenLyricsControls.updateCurrentTimeManually(
                      elapsedTime + newOffset / 1000
                    );
                  }}
                  onSwipeUp={() => {
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      skipOperationRef.current = true;
                      startTrackSwitch();
                      nextTrack();
                      const newTrack = getCurrentStoreTrack();
                      if (newTrack) {
                        const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                        showStatus(`⏭ ${newTrack.title}${artistInfo}`);
                      }
                    }
                  }}
                  onSwipeDown={() => {
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      skipOperationRef.current = true;
                      startTrackSwitch();
                      previousTrack();
                      const newTrack = getCurrentStoreTrack();
                      if (newTrack) {
                        const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                        showStatus(`⏮ ${newTrack.title}${artistInfo}`);
                      }
                    }
                  }}
                  isTranslating={fullScreenLyricsControls.isTranslating}
                  textSizeClass="fullscreen-lyrics-text"
                  gapClass="gap-0"
                  containerStyle={{
                    gap: "clamp(0.2rem, calc(min(10vw,10vh) * 0.08), 1rem)",
                    paddingLeft: "env(safe-area-inset-left, 0px)",
                    paddingRight: "env(safe-area-inset-right, 0px)",
                  }}
                  interactive={true}
                  bottomPaddingClass={controlsVisible ? "pb-28" : "pb-16"}
                  furiganaMap={furiganaMap}
                  soramimiMap={soramimiMap}
                  currentTimeMs={
                    (elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000
                  }
                  onSeekToTime={seekToTime}
                  coverUrl={fullscreenCoverUrl}
                  coverColor={currentTrack?.coverColor}
                  onCoverColorResolved={saveCoverColor}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </FullScreenPortal>
  );
}
