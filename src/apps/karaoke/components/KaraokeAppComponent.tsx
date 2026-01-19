import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { KaraokeMenuBar } from "./KaraokeMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog } from "@/components/dialogs/SongSearchDialog";
import { appMetadata } from "..";
import { LyricsDisplay } from "@/apps/ipod/components/LyricsDisplay";
import { FullScreenPortal } from "@/apps/ipod/components/FullScreenPortal";
import { CoverFlow } from "@/apps/ipod/components/CoverFlow";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { getTranslatedAppName } from "@/utils/i18n";
import { ActivityIndicatorWithLabel } from "@/components/ui/activity-indicator-with-label";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useKaraokeLogic } from "../hooks/useKaraokeLogic";

export function KaraokeAppComponent({
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
    loopAll,
    isShuffled,
    isPlaying,
    isFullScreen,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    lyricsFontClassName,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    setLyricsTranslationLanguage,
    toggleLyrics,
    togglePlay,
    toggleShuffle,
    toggleLoopAll,
    toggleLoopCurrent,
    nextTrack,
    previousTrack,
    toggleFullScreen,
    isOffline,
    manualSync,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isLangMenuOpen,
    setIsLangMenuOpen,
    isPronunciationMenuOpen,
    setIsPronunciationMenuOpen,
    anyMenuOpen,
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
    isCoverFlowOpen,
    setIsCoverFlowOpen,
    coverFlowRef,
    screenLongPressTimerRef,
    screenLongPressFiredRef,
    longPressStartPos,
    LONG_PRESS_MOVE_THRESHOLD,
    fullScreenPlayerRef,
    playerRef,
    elapsedTime,
    duration,
    setDuration,
    statusMessage,
    showControls,
    ipodVolume,
    userHasInteractedRef,
    currentTrack,
    lyricsSourceOverride,
    coverUrl,
    lyricsControls,
    furiganaMap,
    soramimiMap,
    activityState,
    hasActiveActivity,
    translationLanguages,
    showStatus,
    showOfflineStatus,
    restartAutoHideTimer,
    registerActivity,
    handlePrevious,
    handlePlayPause,
    handleNext,
    closeSyncMode,
    handleTrackEnd,
    handleProgress,
    handlePlay,
    handlePause,
    handleMainPlayerPause,
    seekTime,
    seekToTime,
    cycleAlignment,
    cycleLyricsFont,
    handleShareSong,
    karaokeGenerateShareUrl,
    handleRefreshLyrics,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleAddSong,
    handleSongSearchSelect,
    handleAddUrl,
    handlePlayTrack,
    handleToggleCoverFlow,
    handleCoverFlowSelectTrack,
    handleCoverFlowPlayInPlace,
    handleCoverFlowRotation,
    clearLibrary,
    setLyricOffset,
    isXpTheme,
    getCurrentKaraokeTrack,
    adjustLyricOffset,
  } = useKaraokeLogic({ isWindowOpen, isForeground, initialData, instanceId });

  const menuBar = (
    <KaraokeMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onAddSong={handleAddSong}
      onShareSong={handleShareSong}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
      onSyncLibrary={manualSync}
      onPlayTrack={handlePlayTrack}
      onTogglePlay={togglePlay}
      onPreviousTrack={previousTrack}
      onNextTrack={nextTrack}
      isPlaying={isPlaying}
      isShuffled={isShuffled}
      onToggleShuffle={toggleShuffle}
      loopAll={loopAll}
      onToggleLoopAll={toggleLoopAll}
      loopCurrent={loopCurrent}
      onToggleLoopCurrent={toggleLoopCurrent}
      showLyrics={showLyrics}
      onToggleLyrics={toggleLyrics}
      onToggleFullScreen={toggleFullScreen}
      onRefreshLyrics={handleRefreshLyrics}
      onAdjustTiming={() => setIsSyncModeOpen(true)}
      tracks={tracks}
      currentIndex={currentIndex}
      onToggleCoverFlow={handleToggleCoverFlow}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={currentTrack ? `${currentTrack.title}${currentTrack.artist ? ` - ${currentTrack.artist}` : ""}` : getTranslatedAppName("karaoke")}
        onClose={onClose}
        isForeground={isForeground}
        appId="karaoke"
        material="notitlebar"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        onFullscreenToggle={toggleFullScreen}
      >
        <div
          className="relative w-full h-full bg-black select-none overflow-hidden @container"
          onMouseMove={(e) => {
            restartAutoHideTimer();
            // Cancel long press if moved too far from start position
            if (longPressStartPos.current && screenLongPressTimerRef.current) {
              const dx = e.clientX - longPressStartPos.current.x;
              const dy = e.clientY - longPressStartPos.current.y;
              if (Math.abs(dx) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > LONG_PRESS_MOVE_THRESHOLD) {
                clearTimeout(screenLongPressTimerRef.current);
                screenLongPressTimerRef.current = null;
                longPressStartPos.current = null;
              }
            }
          }}
          onMouseDown={(e) => {
            // Start long press timer for CoverFlow toggle
            if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
            screenLongPressFiredRef.current = false;
            longPressStartPos.current = { x: e.clientX, y: e.clientY };
            screenLongPressTimerRef.current = setTimeout(() => {
              screenLongPressFiredRef.current = true;
              handleToggleCoverFlow();
            }, 500);
          }}
          onMouseUp={() => {
            if (screenLongPressTimerRef.current) {
              clearTimeout(screenLongPressTimerRef.current);
              screenLongPressTimerRef.current = null;
            }
            longPressStartPos.current = null;
          }}
          onMouseLeave={() => {
            if (screenLongPressTimerRef.current) {
              clearTimeout(screenLongPressTimerRef.current);
              screenLongPressTimerRef.current = null;
            }
            longPressStartPos.current = null;
          }}
          onTouchStart={(e) => {
            if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
            screenLongPressFiredRef.current = false;
            const touch = e.touches[0];
            longPressStartPos.current = { x: touch.clientX, y: touch.clientY };
            screenLongPressTimerRef.current = setTimeout(() => {
              screenLongPressFiredRef.current = true;
              handleToggleCoverFlow();
            }, 500);
          }}
          onTouchMove={(e) => {
            // Cancel long press if moved too far from start position
            if (longPressStartPos.current && screenLongPressTimerRef.current) {
              const touch = e.touches[0];
              const dx = touch.clientX - longPressStartPos.current.x;
              const dy = touch.clientY - longPressStartPos.current.y;
              if (Math.abs(dx) > LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > LONG_PRESS_MOVE_THRESHOLD) {
                clearTimeout(screenLongPressTimerRef.current);
                screenLongPressTimerRef.current = null;
                longPressStartPos.current = null;
              }
            }
          }}
          onTouchEnd={() => {
            if (screenLongPressTimerRef.current) {
              clearTimeout(screenLongPressTimerRef.current);
              screenLongPressTimerRef.current = null;
            }
            longPressStartPos.current = null;
          }}
          onTouchCancel={() => {
            if (screenLongPressTimerRef.current) {
              clearTimeout(screenLongPressTimerRef.current);
              screenLongPressTimerRef.current = null;
            }
            longPressStartPos.current = null;
          }}
          onClick={() => {
            // Don't trigger click if long press was fired
            if (screenLongPressFiredRef.current) {
              screenLongPressFiredRef.current = false;
              return;
            }
            // Mark user interaction for autoplay guard
            userHasInteractedRef.current = true;
            if (isOffline) {
              showOfflineStatus();
            } else if (currentTrack && !isCoverFlowOpen) {
              togglePlay();
              showStatus(isPlaying ? "⏸" : "▶");
            }
          }}
        >
          {/* Video Player - container clips YouTube UI by extending height and using negative margin */}
          {currentTrack ? (
            <div className="absolute inset-0 overflow-hidden">
              <div className="w-full h-[calc(100%+400px)] mt-[-200px]">
                <ReactPlayer
                  ref={playerRef}
                  url={currentTrack.url}
                  playing={isPlaying && !isFullScreen}
                  width="100%"
                  height="100%"
                  volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                  loop={loopCurrent}
                  onEnded={handleTrackEnd}
                  onProgress={handleProgress}
                  onDuration={setDuration}
                  progressInterval={100}
                  onPlay={handlePlay}
                  onPause={handleMainPlayerPause}
                  style={{ pointerEvents: "none" }}
                  config={{
                    youtube: {
                      playerVars: {
                        modestbranding: 1,
                        rel: 0,
                        showinfo: 0,
                        iv_load_policy: 3,
                        cc_load_policy: 0,
                        fs: 0,
                        playsinline: 1,
                        enablejsapi: 1,
                        origin: window.location.origin,
                        controls: 0,
                      },
                      embedOptions: {
                        referrerPolicy: "strict-origin-when-cross-origin",
                      },
                    },
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-geneva-12">
              {t("apps.karaoke.noTrack")}
            </div>
          )}

          {/* Paused cover overlay */}
          <AnimatePresence>
            {currentTrack && !isPlaying && coverUrl && (
              <motion.div
                className="absolute inset-0 z-15"
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
                  src={coverUrl}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover brightness-50 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lyrics overlay */}
          {showLyrics && currentTrack && (
            <>
              <div className="absolute inset-0 z-10 bg-black/50 pointer-events-none" />
              <div className="absolute inset-0 z-20 pointer-events-none karaoke-force-font">
                <LyricsDisplay
                  lines={lyricsControls.lines}
                  originalLines={lyricsControls.originalLines}
                  currentLine={lyricsControls.currentLine}
                  isLoading={lyricsControls.isLoading}
                  error={lyricsControls.error}
                  visible={true}
                  videoVisible={true}
                  alignment={lyricsAlignment}
                  koreanDisplay={koreanDisplay}
                  japaneseFurigana={japaneseFurigana}
                  fontClassName={lyricsFontClassName}
                  onAdjustOffset={(delta) => {
                    adjustLyricOffset(currentIndex, delta);
                    const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
                    const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                    showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                    lyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
                  }}
                  onSwipeUp={() => {
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      nextTrack();
                      showStatus("⏭");
                    }
                  }}
                  onSwipeDown={() => {
                    if (isOffline) {
                      showOfflineStatus();
                    } else {
                      previousTrack();
                      showStatus("⏮");
                    }
                  }}
                  isTranslating={lyricsControls.isTranslating}
                  textSizeClass="karaoke-lyrics-text"
                  gapClass="gap-1"
                  containerStyle={{
                    gap: "clamp(0.3rem, 2.5cqw, 1rem)",
                  }}
                  interactive={true}
                  bottomPaddingClass={showControls || anyMenuOpen || !isPlaying ? "pb-20" : "pb-12"}
                  furiganaMap={furiganaMap}
                  soramimiMap={soramimiMap}
                  currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
                  onSeekToTime={seekToTime}
                />
              </div>
            </>
          )}

          {/* CoverFlow overlay - full height, below notitlebar (z-50) */}
          {tracks.length > 0 && (
            <div className={`absolute inset-0 z-40 ${isCoverFlowOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
              <CoverFlow
                ref={coverFlowRef}
                tracks={tracks}
                currentIndex={currentIndex}
                onSelectTrack={handleCoverFlowSelectTrack}
                onExit={() => setIsCoverFlowOpen(false)}
                onRotation={handleCoverFlowRotation}
                isVisible={isCoverFlowOpen}
                ipodMode={false}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onPlayTrackInPlace={handleCoverFlowPlayInPlace}
              />
            </div>
          )}

          {/* Status message - scales with container size */}
          <AnimatePresence>
            {statusMessage && (
              <motion.div
                className="absolute top-8 left-6 z-40 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative">
                  <div
                    className="font-chicago text-white relative z-10 karaoke-status-text"
                  >
                    {statusMessage}
                  </div>
                  <div
                    className="font-chicago text-black absolute inset-0 karaoke-status-text"
                    style={{ WebkitTextStroke: "5px black", textShadow: "none" }}
                  >
                    {statusMessage}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Activity indicator - scales with container size */}
          <AnimatePresence>
            {hasActiveActivity && (
              <motion.div
                className="absolute top-8 right-6 z-40 pointer-events-none flex justify-end"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <ActivityIndicatorWithLabel
                  size={32}
                  state={activityState}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Control toolbar - hidden when CoverFlow is open */}
          <div
            data-toolbar
            className={cn(
              "absolute bottom-0 left-0 right-0 flex justify-center z-[60] transition-opacity duration-200",
              (showControls || anyMenuOpen || !isPlaying) && !isCoverFlowOpen
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            )}
            style={{
              paddingBottom: "1.5rem",
            }}
            onClick={(e) => {
              e.stopPropagation();
              restartAutoHideTimer();
            }}
          >
            <FullscreenPlayerControls
              isPlaying={isPlaying}
              onPrevious={handlePrevious}
              onPlayPause={handlePlayPause}
              onNext={handleNext}
              isShuffled={isShuffled}
              onToggleShuffle={toggleShuffle}
              onSyncMode={() => setIsSyncModeOpen((prev) => !prev)}
              currentAlignment={lyricsAlignment}
              onAlignmentCycle={cycleAlignment}
              currentFont={lyricsFont}
              onFontCycle={cycleLyricsFont}
              romanization={romanization}
              onRomanizationChange={setRomanization}
              isPronunciationMenuOpen={isPronunciationMenuOpen}
              setIsPronunciationMenuOpen={setIsPronunciationMenuOpen}
              currentTranslationCode={lyricsTranslationLanguage}
              onTranslationSelect={setLyricsTranslationLanguage}
              translationLanguages={translationLanguages}
              isLangMenuOpen={isLangMenuOpen}
              setIsLangMenuOpen={setIsLangMenuOpen}
              variant="compact"
              bgOpacity="60"
              onInteraction={restartAutoHideTimer}
            />
          </div>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="karaoke"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="karaoke"
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
          generateShareUrl={karaokeGenerateShareUrl}
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
        {/* z-40 so the notitlebar hover titlebar (z-50) appears above it */}
        {!isFullScreen && isSyncModeOpen && lyricsControls.originalLines.length > 0 && (
          <div className="absolute inset-0 z-40" style={{ borderRadius: "inherit" }}>
            <LyricsSyncMode
              lines={lyricsControls.originalLines}
              currentTimeMs={elapsedTime * 1000}
              durationMs={duration * 1000}
              currentOffset={currentTrack?.lyricOffset ?? 0}
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
                const newOffset = (currentTrack?.lyricOffset ?? 0) + deltaMs;
                showStatus(
                  `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
                );
              }}
              onSeek={(timeMs) => {
                playerRef.current?.seekTo(timeMs / 1000);
              }}
              onClose={closeSyncMode}
              onSearchLyrics={handleRefreshLyrics}
            />
          </div>
        )}
      </WindowFrame>

      {/* Full screen portal */}
      {isFullScreen && (
        <FullScreenPortal
          onClose={toggleFullScreen}
          togglePlay={togglePlay}
          nextTrack={() => {
            nextTrack();
            const newTrack = getCurrentKaraokeTrack();
            if (newTrack) {
              const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
              showStatus(`⏭ ${newTrack.title}${artistInfo}`);
            }
          }}
          previousTrack={() => {
            previousTrack();
            const newTrack = getCurrentKaraokeTrack();
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
          onSelectTranslation={setLyricsTranslationLanguage}
          currentAlignment={lyricsAlignment}
          onCycleAlignment={cycleAlignment}
          currentLyricsFont={lyricsFont}
          onCycleLyricsFont={cycleLyricsFont}
          romanization={romanization}
          onRomanizationChange={setRomanization}
          onSyncMode={() => setIsSyncModeOpen((prev) => !prev)}
          isSyncModeOpen={isSyncModeOpen}
          syncModeContent={
            lyricsControls.originalLines.length > 0 ? (
              <LyricsSyncMode
                lines={lyricsControls.originalLines}
                currentTimeMs={elapsedTime * 1000}
                durationMs={duration * 1000}
                currentOffset={currentTrack?.lyricOffset ?? 0}
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
                  const newOffset = (currentTrack?.lyricOffset ?? 0) + deltaMs;
                  showStatus(
                    `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
                  );
                }}
                onSeek={(timeMs) => {
                  const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
                  activePlayer?.seekTo(timeMs / 1000);
                }}
                onClose={closeSyncMode}
                onSearchLyrics={handleRefreshLyrics}
              />
            ) : undefined
          }
          fullScreenPlayerRef={fullScreenPlayerRef}
          activityState={activityState}
        >
          {({ controlsVisible }) => (
            <div className="flex flex-col w-full h-full">
              <div className="relative w-full h-full overflow-hidden">
                <div className="absolute inset-0 w-full h-full">
                  <div
                    className="w-full absolute"
                    style={{
                      height: "calc(100% + clamp(480px, 60dvh, 800px))",
                      top: "calc(clamp(240px, 30dvh, 400px) * -1)",
                    }}
                  >
                    {currentTrack && (
                      <div className="w-full h-full pointer-events-none">
                        <ReactPlayer
                          ref={fullScreenPlayerRef}
                          url={currentTrack.url}
                          playing={isPlaying && isFullScreen}
                          controls
                          width="100%"
                          height="100%"
                          volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                          loop={loopCurrent}
                          onEnded={handleTrackEnd}
                          onProgress={handleProgress}
                          progressInterval={100}
                          onPlay={handlePlay}
                          onPause={handlePause}
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

                {/* Paused cover overlay */}
                <AnimatePresence>
                  {currentTrack && !isPlaying && coverUrl && (
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
                        src={coverUrl}
                        alt={currentTrack.title}
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
                {showLyrics && currentTrack && (
                  <div className="fixed inset-0 bg-black/50 z-10 pointer-events-none" />
                )}

                {showLyrics && currentTrack && (
                  <div className="absolute inset-0 z-20 pointer-events-none" data-lyrics>
                    <LyricsDisplay
                      lines={lyricsControls.lines}
                      originalLines={lyricsControls.originalLines}
                      currentLine={lyricsControls.currentLine}
                      isLoading={lyricsControls.isLoading}
                      error={lyricsControls.error}
                      visible={true}
                      videoVisible={true}
                      alignment={lyricsAlignment}
                      koreanDisplay={koreanDisplay}
                      japaneseFurigana={japaneseFurigana}
                      fontClassName={lyricsFontClassName}
                      onAdjustOffset={(delta) => {
                        adjustLyricOffset(currentIndex, delta);
                        const newOffset = (currentTrack?.lyricOffset ?? 0) + delta;
                        const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                        showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                        lyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
                      }}
                      onSwipeUp={() => {
                        if (isOffline) {
                          showOfflineStatus();
                        } else {
                          nextTrack();
                          setTimeout(() => {
                            const newIndex = (currentIndex + 1) % tracks.length;
                            const newTrack = tracks[newIndex];
                            if (newTrack) {
                              const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                              showStatus(`⏭ ${newTrack.title}${artistInfo}`);
                            }
                          }, 150);
                        }
                      }}
                      onSwipeDown={() => {
                        if (isOffline) {
                          showOfflineStatus();
                        } else {
                          previousTrack();
                          setTimeout(() => {
                            const newIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
                            const newTrack = tracks[newIndex];
                            if (newTrack) {
                              const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                              showStatus(`⏮ ${newTrack.title}${artistInfo}`);
                            }
                          }, 150);
                        }
                      }}
                      isTranslating={lyricsControls.isTranslating}
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
    </>
  );
}
