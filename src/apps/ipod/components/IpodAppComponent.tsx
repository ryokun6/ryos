import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { IpodMenuBar } from "./IpodMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "..";
import { IpodScreen } from "./IpodScreen";
import { IpodWheel } from "./IpodWheel";
import { PipPlayer } from "./PipPlayer";
import { FullScreenPortal } from "./FullScreenPortal";
import { LyricsDisplay } from "./LyricsDisplay";
import { CoverFlow } from "./CoverFlow";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog } from "@/components/dialogs/SongSearchDialog";
import { getTranslatedAppName } from "@/utils/i18n";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useIpodLogic } from "../hooks/useIpodLogic";
import { DisplayMode } from "@/types/lyrics";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";

export function IpodAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<IpodInitialData>) {
  const {
    t,
    translatedHelpItems,
    tracks,
    currentIndex,
    loopCurrent,
    isPlaying,
    showVideo,
    backlightOn,
    theme,
    lcdFilterOn,
    displayMode,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    lyricsFontClassName,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    lyricOffset,
    isFullScreen,
    toggleFullScreen,
    isMinimized,
    isXpTheme,
    isOffline,
    playerRef,
    fullScreenPlayerRef,
    coverFlowRef,
    containerRef,
    statusMessage,
    elapsedTime,
    totalTime,
    scale,
    menuMode,
    selectedMenuItem,
    menuDirection,
    menuHistory,
    isCoverFlowOpen,
    activityState,
    skipOperationRef,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmClearOpen,
    setIsConfirmClearOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    isLyricsSearchDialogOpen,
    setIsLyricsSearchDialogOpen,
    isSongSearchDialogOpen,
    setIsSongSearchDialogOpen,
    isSyncModeOpen,
    setIsSyncModeOpen,
    currentTrack,
    lyricsSourceOverride,
    fullscreenCoverUrl,
    fullScreenLyricsControls,
    furiganaMap,
    soramimiMap,
    ipodVolume,
    handleTrackEnd,
    handleProgress,
    handleDuration,
    handlePlay,
    handlePause,
    handleReady,
    handleMenuButton,
    handleWheelClick,
    handleWheelRotation,
    handleCenterLongPress,
    handleCoverFlowSelect,
    handleCoverFlowPlayInPlace,
    handleCoverFlowExit,
    handleCoverFlowRotation,
    handleShareSong,
    handleAddSong,
    handleSongSearchSelect,
    handleAddUrl,
    handleRefreshLyrics,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleSelectTranslation,
    cycleAlignment,
    cycleLyricsFont,
    seekTime,
    seekToTime,
    closeSyncMode,
    registerActivity,
    showStatus,
    showOfflineStatus,
    startTrackSwitch,
    togglePlay,
    toggleVideo,
    setSelectedMenuItem,
    setIsCoverFlowOpen,
    nextTrack,
    previousTrack,
    clearLibrary,
    manualSync,
    restoreInstance,
    handleMenuItemAction,
    screenLongPressTimerRef,
    screenLongPressFiredRef,
    screenLongPressStartPos,
    SCREEN_LONG_PRESS_MOVE_THRESHOLD,
    ipodGenerateShareUrl,
    setLyricOffset,
    adjustLyricOffset,
    getCurrentStoreTrack,
  } = useIpodLogic({ isWindowOpen, isForeground, initialData, instanceId });

  const menuBar = (
    <IpodMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
      onSyncLibrary={manualSync}
      onAddSong={handleAddSong}
      onShareSong={handleShareSong}
      onRefreshLyrics={handleRefreshLyrics}
      onAdjustTiming={() => setIsSyncModeOpen(true)}
      onToggleCoverFlow={() => setIsCoverFlowOpen(!isCoverFlowOpen)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("ipod")}
        onClose={onClose}
        isForeground={isForeground}
        appId="ipod"
        material="transparent"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        keepMountedWhenMinimized
        onFullscreenToggle={toggleFullScreen}
      >
        <div
          ref={containerRef}
          className="ipod-force-font flex flex-col items-center justify-center w-full h-full bg-gradient-to-b from-gray-100/20 to-gray-300/20 backdrop-blur-lg p-4 select-none"
          style={{ position: "relative", overflow: "hidden", contain: "layout style paint" }}
        >
          <div
            className={cn(
              "ipod-force-font w-[250px] h-[400px] rounded-2xl shadow-xl border border-black/40 flex flex-col items-center p-4 pb-8",
              theme === "classic" ? "bg-white/85" : "bg-black/85"
            )}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center",
              transition: "transform 0.2s ease",
              minWidth: "250px",
              minHeight: "400px",
              maxWidth: "250px",
              maxHeight: "400px",
              contain: "layout style paint",
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          >
            {/* Screen container with Cover Flow overlay */}
            <div 
              className="relative w-full" 
              style={{ height: "150px", minHeight: "150px", maxHeight: "150px" }}
              onMouseDown={(e) => {
                // Start long press timer for CoverFlow toggle
                if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
                screenLongPressFiredRef.current = false;
                screenLongPressStartPos.current = { x: e.clientX, y: e.clientY };
                screenLongPressTimerRef.current = setTimeout(() => {
                  screenLongPressFiredRef.current = true;
                  handleCenterLongPress();
                }, 500);
              }}
              onMouseMove={(e) => {
                // Cancel long press if moved too far from start position
                if (screenLongPressStartPos.current && screenLongPressTimerRef.current) {
                  const dx = e.clientX - screenLongPressStartPos.current.x;
                  const dy = e.clientY - screenLongPressStartPos.current.y;
                  if (Math.abs(dx) > SCREEN_LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > SCREEN_LONG_PRESS_MOVE_THRESHOLD) {
                    clearTimeout(screenLongPressTimerRef.current);
                    screenLongPressTimerRef.current = null;
                    screenLongPressStartPos.current = null;
                  }
                }
              }}
              onMouseUp={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
              onMouseLeave={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
              onTouchStart={(e) => {
                if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
                screenLongPressFiredRef.current = false;
                const touch = e.touches[0];
                screenLongPressStartPos.current = { x: touch.clientX, y: touch.clientY };
                screenLongPressTimerRef.current = setTimeout(() => {
                  screenLongPressFiredRef.current = true;
                  handleCenterLongPress();
                }, 500);
              }}
              onTouchMove={(e) => {
                // Cancel long press if moved too far from start position
                if (screenLongPressStartPos.current && screenLongPressTimerRef.current) {
                  const touch = e.touches[0];
                  const dx = touch.clientX - screenLongPressStartPos.current.x;
                  const dy = touch.clientY - screenLongPressStartPos.current.y;
                  if (Math.abs(dx) > SCREEN_LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > SCREEN_LONG_PRESS_MOVE_THRESHOLD) {
                    clearTimeout(screenLongPressTimerRef.current);
                    screenLongPressTimerRef.current = null;
                    screenLongPressStartPos.current = null;
                  }
                }
              }}
              onTouchEnd={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
              onTouchCancel={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
            >
              <IpodScreen
                currentTrack={tracks[currentIndex] || null}
                isPlaying={isPlaying && !isFullScreen}
                elapsedTime={elapsedTime}
                totalTime={totalTime}
                menuMode={menuMode}
                menuHistory={menuHistory}
                selectedMenuItem={selectedMenuItem}
                onSelectMenuItem={setSelectedMenuItem}
                currentIndex={currentIndex}
                tracksLength={tracks.length}
                backlightOn={backlightOn}
                menuDirection={menuDirection}
                onMenuItemAction={handleMenuItemAction}
                showVideo={showVideo}
                displayMode={displayMode}
                playerRef={playerRef}
                handleTrackEnd={handleTrackEnd}
                handleProgress={handleProgress}
                handleDuration={handleDuration}
                handlePlay={handlePlay}
                handlePause={handlePause}
                handleReady={handleReady}
                loopCurrent={loopCurrent}
                statusMessage={statusMessage}
                onToggleVideo={toggleVideo}
                lcdFilterOn={lcdFilterOn}
                ipodVolume={ipodVolume}
                showStatusCallback={showStatus}
                showLyrics={showLyrics}
                lyricsAlignment={lyricsAlignment}
                koreanDisplay={koreanDisplay}
                japaneseFurigana={japaneseFurigana}
                lyricOffset={lyricOffset ?? 0}
                adjustLyricOffset={(delta) => adjustLyricOffset(currentIndex, delta)}
                registerActivity={registerActivity}
                isFullScreen={isFullScreen}
                lyricsControls={fullScreenLyricsControls}
                furiganaMap={furiganaMap}
                soramimiMap={soramimiMap}
                activityState={activityState}
                onNextTrack={() => {
                  if (isOffline) {
                    showOfflineStatus();
                  } else {
                    skipOperationRef.current = true;
                    startTrackSwitch();
                    nextTrack();
                    showStatus("⏭");
                  }
                }}
                onPreviousTrack={() => {
                  if (isOffline) {
                    showOfflineStatus();
                  } else {
                    skipOperationRef.current = true;
                    startTrackSwitch();
                    previousTrack();
                    showStatus("⏮");
                  }
                }}
              />

              {/* Cover Flow overlay - positioned within screen bounds */}
              <CoverFlow
                ref={coverFlowRef}
                tracks={tracks}
                currentIndex={currentIndex}
                onSelectTrack={handleCoverFlowSelect}
                onExit={handleCoverFlowExit}
                onRotation={handleCoverFlowRotation}
                isVisible={isCoverFlowOpen}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onPlayTrackInPlace={handleCoverFlowPlayInPlace}
              />
            </div>

            <IpodWheel
              theme={theme}
              onWheelClick={handleWheelClick}
              onWheelRotation={handleWheelRotation}
              onMenuButton={handleMenuButton}
              onCenterLongPress={handleCenterLongPress}
            />
          </div>
        </div>

        {/* Full screen portal */}
        {isFullScreen && (
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
                    const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
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
                    style={displayMode !== DisplayMode.Video ? { visibility: "hidden", pointerEvents: "none" } : undefined}
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
                          <ReactPlayer
                            ref={fullScreenPlayerRef}
                            url={tracks[currentIndex].url}
                            playing={isPlaying && isFullScreen}
                            controls
                            width="100%"
                            height="100%"
                            volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                            loop={loopCurrent}
                            onEnded={handleTrackEnd}
                            onProgress={handleProgress}
                            progressInterval={100}
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
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Landscape video background (fullscreen) */}
                  {displayMode === DisplayMode.Landscapes && tracks[currentIndex] && (
                    <LandscapeVideoBackground
                      isActive={!!tracks[currentIndex]}
                      className="fixed inset-0 z-[5]"
                    />
                  )}

                  {/* Ambient blurred cover background (fullscreen) */}
                  {displayMode === DisplayMode.Shader && tracks[currentIndex] && (
                    <AmbientBackground
                      coverUrl={fullscreenCoverUrl}
                      isActive={!!tracks[currentIndex]}
                      className="fixed inset-0 z-[5]"
                    />
                  )}

                  {/* Cover overlay: shows when paused (any mode) or always in Cover mode */}
                  <AnimatePresence>
                    {tracks[currentIndex] && fullscreenCoverUrl && (displayMode === DisplayMode.Cover || !isPlaying) && (
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

                  {/* Lyrics overlays - positioned relative to viewport, not video container */}
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
                        fontClassName={lyricsFontClassName}
                        onAdjustOffset={(delta) => {
                          adjustLyricOffset(currentIndex, delta);
                          const newOffset = (tracks[currentIndex]?.lyricOffset ?? 0) + delta;
                          const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                          showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                          fullScreenLyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
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
                        currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
                        onSeekToTime={seekToTime}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </FullScreenPortal>
        )}

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="ipod"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="ipod"
        />
        <ConfirmDialog
          isOpen={isConfirmClearOpen}
          onOpenChange={setIsConfirmClearOpen}
          onConfirm={() => {
            clearLibrary();
            setIsConfirmClearOpen(false);
            showStatus(t("apps.ipod.status.libraryCleared"));
          }}
          title={t("apps.ipod.dialogs.clearLibraryTitle")}
          description={t("apps.ipod.dialogs.clearLibraryDescription")}
        />
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType="Song"
          itemIdentifier={tracks[currentIndex]?.id || ""}
          title={tracks[currentIndex]?.title}
          details={tracks[currentIndex]?.artist}
          generateShareUrl={ipodGenerateShareUrl}
        />
        {currentTrack && (
          <LyricsSearchDialog
            isOpen={isLyricsSearchDialogOpen}
            onOpenChange={setIsLyricsSearchDialogOpen}
            trackId={currentTrack.id}
            trackTitle={currentTrack.title}
            trackArtist={currentTrack.artist}
            initialQuery={`${currentTrack.title} ${currentTrack.artist || ""}`.trim()}
            onSelect={handleLyricsSearchSelect}
            onReset={handleLyricsSearchReset}
            hasOverride={!!lyricsSourceOverride}
            currentSelection={lyricsSourceOverride}
          />
        )}
        <SongSearchDialog
          isOpen={isSongSearchDialogOpen}
          onOpenChange={setIsSongSearchDialogOpen}
          onSelect={handleSongSearchSelect}
          onAddUrl={handleAddUrl}
        />

        {/* Lyrics Sync Mode (non-fullscreen only - fullscreen renders in portal) */}
        {!isFullScreen && isSyncModeOpen && fullScreenLyricsControls.originalLines.length > 0 && (
          <div className="absolute inset-0 z-50" style={{ borderRadius: "inherit" }}>
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
                playerRef.current?.seekTo(timeMs / 1000);
              }}
              onClose={closeSyncMode}
            />
          </div>
        )}
      </WindowFrame>

      {/* PIP Player */}
      <AnimatePresence>
        {isMinimized && !isFullScreen && tracks.length > 0 && currentIndex >= 0 && (
          <PipPlayer
            currentTrack={tracks[currentIndex] || null}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onNextTrack={() => { startTrackSwitch(); nextTrack(); }}
            onPreviousTrack={() => { startTrackSwitch(); previousTrack(); }}
            onRestore={() => {
              if (instanceId) restoreInstance(instanceId);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
