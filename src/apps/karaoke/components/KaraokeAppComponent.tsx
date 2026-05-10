import { useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, KaraokeInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { KaraokeMenuBar } from "./KaraokeMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog } from "@/components/dialogs/SongSearchDialog";
import { appMetadata } from "..";
import { FullScreenPortal } from "@/apps/ipod/components/FullScreenPortal";
import { CoverFlow } from "@/apps/ipod/components/CoverFlow";
import { ListenSessionInvite } from "@/components/listen/ListenSessionInvite";
import { JoinSessionDialog } from "@/components/listen/JoinSessionDialog";
import { ReactionOverlay } from "@/components/listen/ReactionOverlay";
import { ListenSessionToolbar } from "@/components/listen/ListenSessionToolbar";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  KaraokeLyricsPlaybackProvider,
  KaraokeWindowLyricsOverlay,
  KaraokeFullscreenLyricsOverlay,
  KaraokeLyricsActivityIndicator,
  KaraokeSyncModeWindowPanel,
  KaraokeSyncModeFullscreenPanel,
} from "./KaraokeLyricsPlayback";
import { KaraokeIosAutoplayWatchdog } from "./KaraokeIosAutoplayWatchdog";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useKaraokeLogic } from "../hooks/useKaraokeLogic";
import { KaraokeLibraryEmptyState } from "./KaraokeLibraryEmptyState";
import { DisplayMode } from "@/types/lyrics";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { WaterBackground } from "@/components/shared/WaterBackground";
import { PLAYER_PROGRESS_INTERVAL_MS } from "@/apps/ipod/constants";
import { useChatsStore } from "@/stores/useChatsStore";
import { useShallow } from "zustand/react/shallow";

export function KaraokeAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<KaraokeInitialData>) {
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
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    setLyricsTranslationLanguage,
    displayMode,
    toggleLyrics,
    toggleShuffle,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleFullScreen,
    setIsPlaying,
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
    isAddingSong,
    isListenInviteOpen,
    setIsListenInviteOpen,
    isJoinListenDialogOpen,
    setIsJoinListenDialogOpen,
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
    lyricsPlaybackSyncRef,
    duration,
    setDuration,
    statusMessage,
    showControls,
    ipodVolume,
    userHasInteractedRef,
    currentTrack,
    lyricsSourceOverride,
    coverUrl,
    translationLanguages,
    listenSession,
    listenSessionUsername,
    listenSessionClientInstanceId,
    listenListenerCount,
    isListenSessionHost,
    isListenSessionDj,
    isListenSessionRemoteOnly,
    isListenSessionAnonymous,
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
    handleReady,
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
    setDisplayMode,
    handleStartListenSession,
    handleJoinListenSession,
    handleLeaveListenSession,
    handlePassDj,
    handleAssignPlaybackDevice,
    handleTransferSessionHost,
    handleSendReaction,
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
  } = useKaraokeLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  const { username, isAuthenticated } = useChatsStore(
    useShallow((s) => ({ username: s.username, isAuthenticated: s.isAuthenticated }))
  );
  const auth = useMemo(
    () => (username && isAuthenticated ? { username, isAuthenticated } : undefined),
    [username, isAuthenticated]
  );

  const showEmptyLibrary = tracks.length === 0 && !currentTrack;

  // Memoized so the FullScreenPortal / FullscreenPlayerControls don't see a
  // freshly-allocated array on every parent render (this component re-renders
  // on every playback tick because elapsedTime is a hook return value).
  const displayModeOptions = useMemo(
    () => [
      { value: DisplayMode.Video, label: t("apps.ipod.menu.displayVideo") },
      { value: DisplayMode.Mesh, label: t("apps.ipod.menu.displayGradient") },
      { value: DisplayMode.Water, label: t("apps.ipod.menu.displayWater") },
      { value: DisplayMode.Shader, label: t("apps.ipod.menu.displayShader") },
      { value: DisplayMode.Landscapes, label: t("apps.ipod.menu.displayLandscapes") },
      { value: DisplayMode.Cover, label: t("apps.ipod.menu.displayCover") },
    ],
    [t]
  );

  const handleDisplayModeSelect = useCallback(
    (value: DisplayMode) => {
      setDisplayMode(value);
      const labels: Record<DisplayMode, string> = {
        [DisplayMode.Video]: t("apps.ipod.menu.displayVideo"),
        [DisplayMode.Cover]: t("apps.ipod.menu.displayCover"),
        [DisplayMode.Landscapes]: t("apps.ipod.menu.displayLandscapes"),
        [DisplayMode.Shader]: t("apps.ipod.menu.displayShader"),
        [DisplayMode.Mesh]: t("apps.ipod.menu.displayGradient"),
        [DisplayMode.Water]: t("apps.ipod.menu.displayWater"),
      };
      const label = labels[value] ?? value;
      showStatus(`${t("apps.ipod.menu.display", "Display")}: ${label}`);
    },
    [setDisplayMode, showStatus, t]
  );

  const handleOpenCoverFlowFromTitleCard = useCallback(() => {
    if (tracks.length === 0) return;
    userHasInteractedRef.current = true;
    restartAutoHideTimer();
    setIsCoverFlowOpen(true);
  }, [restartAutoHideTimer, setIsCoverFlowOpen, tracks.length, userHasInteractedRef]);

  const handleFullscreenLyricsSwipeUp = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      handleNext();
      if (!isListenSessionRemoteOnly) {
        setTimeout(() => {
          const newIndex = (currentIndex + 1) % tracks.length;
          const newTrack = tracks[newIndex];
          if (newTrack) {
            const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
            showStatus(`⏭ ${newTrack.title}${artistInfo}`);
          }
        }, 150);
      }
    }
  }, [
    currentIndex,
    handleNext,
    isListenSessionRemoteOnly,
    isOffline,
    showOfflineStatus,
    showStatus,
    tracks,
  ]);

  const handleFullscreenLyricsSwipeDown = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      handlePrevious();
      if (!isListenSessionRemoteOnly) {
        setTimeout(() => {
          const newIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
          const newTrack = tracks[newIndex];
          if (newTrack) {
            const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
            showStatus(`⏮ ${newTrack.title}${artistInfo}`);
          }
        }, 150);
      }
    }
  }, [
    currentIndex,
    handlePrevious,
    isListenSessionRemoteOnly,
    isOffline,
    showOfflineStatus,
    showStatus,
    tracks.length,
    tracks,
  ]);

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
      onTogglePlay={handlePlayPause}
      onPreviousTrack={handlePrevious}
      onNextTrack={handleNext}
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
      onStartListenSession={handleStartListenSession}
      onJoinListenSession={() => setIsJoinListenDialogOpen(true)}
      onShareListenSession={() => setIsListenInviteOpen(true)}
      onLeaveListenSession={handleLeaveListenSession}
      isInListenSession={!!listenSession}
      isListenSessionHost={isListenSessionHost}
    />
  );
  const shouldAnimateVisuals =
    isPlaying && (isForeground ?? true) && !isListenSessionRemoteOnly;

  /** Remote listeners have no local video; force cover backdrop regardless of stored display mode. */
  const effectiveDisplayMode = isListenSessionRemoteOnly
    ? DisplayMode.Cover
    : displayMode;
  const visualBackgroundActive =
    shouldAnimateVisuals && effectiveDisplayMode !== DisplayMode.Video;

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
        onCoverFlowToggle={handleToggleCoverFlow}
        isCoverFlowActive={isCoverFlowOpen}
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
            restartAutoHideTimer();
          }}
        >
          <KaraokeIosAutoplayWatchdog
            listenSession={listenSession}
            isListenSessionDj={isListenSessionDj}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            showStatus={showStatus}
            userHasInteractedRef={userHasInteractedRef}
          />
          {/* Reaction overlay for listen sessions */}
          {listenSession && !isSyncModeOpen && (
            <ReactionOverlay className="z-40" />
          )}
          {/* Video Player - container clips YouTube UI by extending height and using negative margin */}
          {/* When display mode is not Video, the player is hidden visually but still plays audio */}
          {currentTrack ? (
            <div
              className="absolute inset-0 overflow-hidden"
              style={
                effectiveDisplayMode !== DisplayMode.Video
                  ? { visibility: "hidden", pointerEvents: "none" }
                  : undefined
              }
            >
              <div className="w-full h-[calc(100%+400px)] mt-[-200px]">
                <ReactPlayer
                  ref={playerRef}
                  url={currentTrack.url}
                  playing={isPlaying && !isFullScreen && !isListenSessionRemoteOnly}
                  width="100%"
                  height="100%"
                  volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                  loop={loopCurrent}
                  onEnded={handleTrackEnd}
                  onProgress={handleProgress}
                  onDuration={setDuration}
                  progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
                  onPlay={handlePlay}
                  onPause={handleMainPlayerPause}
                  onReady={!isFullScreen ? handleReady : undefined}
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
          ) : showEmptyLibrary ? (
            <div className="absolute inset-0 z-[1]">
              <KaraokeLibraryEmptyState onAddSongs={handleAddSong} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white/50 font-geneva-12">
              {t("apps.karaoke.noTrack")}
            </div>
          )}

          {/* Landscape video background */}
          {effectiveDisplayMode === DisplayMode.Landscapes &&
            visualBackgroundActive &&
            currentTrack && (
            <LandscapeVideoBackground
              isActive={visualBackgroundActive}
              className="absolute inset-0 z-[5]"
            />
          )}

          {/* Warp shader background */}
          {effectiveDisplayMode === DisplayMode.Shader &&
            visualBackgroundActive &&
            currentTrack && (
            <AmbientBackground
              coverUrl={coverUrl}
              variant="warp"
              isActive={visualBackgroundActive}
              className="absolute inset-0 z-[5]"
            />
          )}

          {/* Mesh gradient background */}
          {effectiveDisplayMode === DisplayMode.Mesh &&
            visualBackgroundActive &&
            currentTrack && (
            <MeshGradientBackground
              coverUrl={coverUrl}
              isActive={visualBackgroundActive}
              className="absolute inset-0 z-[5]"
            />
          )}

          {/* Water shader background */}
          {effectiveDisplayMode === DisplayMode.Water &&
            visualBackgroundActive &&
            currentTrack && (
            <WaterBackground
              coverUrl={coverUrl}
              isActive={visualBackgroundActive}
              className="absolute inset-0 z-[5]"
            />
          )}

          {/* Cover overlay: shows when paused (any mode) or always in Cover mode */}
          <AnimatePresence>
            {currentTrack &&
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
                  userHasInteractedRef.current = true;
                  restartAutoHideTimer();
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

          <KaraokeLyricsPlaybackProvider
            currentTrack={currentTrack}
            lyricsFont={lyricsFont}
            romanization={romanization}
            lyricsTranslationLanguage={lyricsTranslationLanguage}
            lyricsSourceOverride={lyricsSourceOverride}
            isAddingSong={isAddingSong}
            setIsLyricsSearchDialogOpen={setIsLyricsSearchDialogOpen}
            t={t}
            auth={auth}
            lyricsPlaybackSyncRef={lyricsPlaybackSyncRef}
          >
            <KaraokeWindowLyricsOverlay
              showLyrics={showLyrics}
              isFullScreen={isFullScreen}
              showControls={showControls}
              anyMenuOpen={anyMenuOpen}
              isPlaying={isPlaying}
              coverUrl={coverUrl}
              isOffline={isOffline}
              currentIndex={currentIndex}
              adjustLyricOffset={adjustLyricOffset}
              showStatus={showStatus}
              showOfflineStatus={showOfflineStatus}
              handleNext={handleNext}
              handlePrevious={handlePrevious}
              seekToTime={seekToTime}
              onOpenCoverFlow={handleOpenCoverFlowFromTitleCard}
              t={t}
              currentTrack={currentTrack}
              koreanDisplay={koreanDisplay}
              japaneseFurigana={japaneseFurigana}
              lyricsAlignment={lyricsAlignment}
            />
            <KaraokeLyricsActivityIndicator />
            <KaraokeSyncModeWindowPanel
              isSyncModeOpen={isSyncModeOpen}
              isFullScreen={isFullScreen}
              currentTrack={currentTrack}
              currentIndex={currentIndex}
              duration={duration}
              romanization={romanization}
              setLyricOffset={setLyricOffset}
              adjustLyricOffset={adjustLyricOffset}
              playerRef={playerRef}
              closeSyncMode={closeSyncMode}
              handleRefreshLyrics={handleRefreshLyrics}
              showStatus={showStatus}
              t={t}
            />
          </KaraokeLyricsPlaybackProvider>

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
                onTogglePlay={handlePlayPause}
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

          {/* Listen Together toolbar - top right when in a session, not tied to bottom controls */}
          {listenSession && !isCoverFlowOpen && !isSyncModeOpen && (
            <div
              className="absolute top-6 right-6 z-[60] flex justify-end pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                restartAutoHideTimer();
              }}
            >
              <ListenSessionToolbar
                session={listenSession}
                isRemoteOnly={isListenSessionRemoteOnly}
                isHost={isListenSessionHost}
                isDj={isListenSessionDj}
                isAnonymous={isListenSessionAnonymous}
                listenerCount={listenListenerCount}
                currentUsername={listenSessionUsername}
                currentClientInstanceId={listenSessionClientInstanceId}
                onShare={() => setIsListenInviteOpen(true)}
                onLeave={handleLeaveListenSession}
                onAssignPlaybackDevice={handleAssignPlaybackDevice}
                onPassDj={handlePassDj}
                onTransferHost={handleTransferSessionHost}
                onSendReaction={handleSendReaction}
                onInteraction={restartAutoHideTimer}
              />
            </div>
          )}

          {/* Control toolbar - hidden when CoverFlow is open */}
          <div
            data-toolbar
            className={cn(
              "absolute bottom-0 left-0 right-0 flex flex-col items-center gap-3 z-[60] transition-opacity duration-200",
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
            {/* Main playback controls */}
            <FullscreenPlayerControls
              isPlaying={isPlaying}
              onPrevious={handlePrevious}
              onPlayPause={handlePlayPause}
              onNext={handleNext}
              isShuffled={isShuffled}
              onToggleShuffle={toggleShuffle}
              displayMode={displayMode}
              onDisplayModeSelect={handleDisplayModeSelect}
              displayModeOptions={displayModeOptions}
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
            currentSelection={
              lyricsSourceOverride
                ? { ...lyricsSourceOverride, cover: currentTrack.cover }
                : undefined
            }
          />
        )}
        <SongSearchDialog
          isOpen={isSongSearchDialogOpen}
          onOpenChange={setIsSongSearchDialogOpen}
          onSelect={handleSongSearchSelect}
          onAddUrl={handleAddUrl}
        />
        {listenSession && (
          <ListenSessionInvite
            isOpen={isListenInviteOpen}
            onClose={() => setIsListenInviteOpen(false)}
            sessionId={listenSession.id}
            appType="karaoke"
          />
        )}
        <JoinSessionDialog
          isOpen={isJoinListenDialogOpen}
          onClose={() => setIsJoinListenDialogOpen(false)}
          onJoin={handleJoinListenSession}
        />
      </WindowFrame>

      {/* Full screen portal */}
      {isFullScreen && (
        <KaraokeLyricsPlaybackProvider
          currentTrack={currentTrack}
          lyricsFont={lyricsFont}
          romanization={romanization}
          lyricsTranslationLanguage={lyricsTranslationLanguage}
          lyricsSourceOverride={lyricsSourceOverride}
          isAddingSong={isAddingSong}
          setIsLyricsSearchDialogOpen={setIsLyricsSearchDialogOpen}
          t={t}
          auth={auth}
          lyricsPlaybackSyncRef={lyricsPlaybackSyncRef}
        >
        <FullScreenPortal
          onClose={toggleFullScreen}
          togglePlay={handlePlayPause}
          nextTrack={() => {
            handleNext();
            if (!isListenSessionRemoteOnly) {
              const newTrack = getCurrentKaraokeTrack();
              if (newTrack) {
                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                showStatus(`⏭ ${newTrack.title}${artistInfo}`);
              }
            }
          }}
          previousTrack={() => {
            handlePrevious();
            if (!isListenSessionRemoteOnly) {
              const newTrack = getCurrentKaraokeTrack();
              if (newTrack) {
                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                showStatus(`⏮ ${newTrack.title}${artistInfo}`);
              }
            }
          }}
          seekTime={seekTime}
          showStatus={showStatus}
          showOfflineStatus={showOfflineStatus}
          registerActivity={registerActivity}
          isPlaying={isPlaying}
          statusMessage={statusMessage}
          disableTapToPlayPause
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
          displayMode={displayMode}
          onDisplayModeSelect={handleDisplayModeSelect}
          displayModeOptions={displayModeOptions}
          syncModeContent={
            <KaraokeSyncModeFullscreenPanel
              isSyncModeOpen={isSyncModeOpen}
              isFullScreen={isFullScreen}
              currentTrack={currentTrack}
              currentIndex={currentIndex}
              duration={duration}
              romanization={romanization}
              setLyricOffset={setLyricOffset}
              adjustLyricOffset={adjustLyricOffset}
              fullScreenPlayerRef={fullScreenPlayerRef}
              playerRef={playerRef}
              closeSyncMode={closeSyncMode}
              handleRefreshLyrics={handleRefreshLyrics}
              showStatus={showStatus}
              t={t}
            />
          }
          fullScreenPlayerRef={fullScreenPlayerRef}
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
                    {currentTrack && (
                      <div className="w-full h-full pointer-events-none">
                        <ReactPlayer
                          ref={fullScreenPlayerRef}
                          url={currentTrack.url}
                          playing={isPlaying && isFullScreen && !isListenSessionRemoteOnly}
                          controls
                          width="100%"
                          height="100%"
                          volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                          loop={loopCurrent}
                          onEnded={handleTrackEnd}
                          onProgress={handleProgress}
                          progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
                          onPlay={handlePlay}
                          onPause={handlePause}
                          onReady={isFullScreen ? handleReady : undefined}
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
                {effectiveDisplayMode === DisplayMode.Landscapes &&
                  visualBackgroundActive &&
                  currentTrack && (
                  <LandscapeVideoBackground
                    isActive={visualBackgroundActive}
                    className="fixed inset-0 z-[5]"
                  />
                )}

                {/* Warp shader background (fullscreen) */}
                {effectiveDisplayMode === DisplayMode.Shader &&
                  visualBackgroundActive &&
                  currentTrack && (
                  <AmbientBackground
                    coverUrl={coverUrl}
                    variant="warp"
                    isActive={visualBackgroundActive}
                    className="fixed inset-0 z-[5]"
                  />
                )}

                {/* Mesh gradient background (fullscreen) */}
                {effectiveDisplayMode === DisplayMode.Mesh &&
                  visualBackgroundActive &&
                  currentTrack && (
                  <MeshGradientBackground
                    coverUrl={coverUrl}
                    isActive={visualBackgroundActive}
                    className="fixed inset-0 z-[5]"
                  />
                )}

                {/* Water shader background (fullscreen) */}
                {effectiveDisplayMode === DisplayMode.Water &&
                  visualBackgroundActive &&
                  currentTrack && (
                  <WaterBackground
                    coverUrl={coverUrl}
                    isActive={visualBackgroundActive}
                    className="fixed inset-0 z-[5]"
                  />
                )}

                {/* Cover overlay: shows when paused (any mode) or always in Cover mode */}
                <AnimatePresence>
                  {currentTrack &&
                    coverUrl &&
                    (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
                    <motion.div
                      className="fixed inset-0 z-15"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        registerActivity();
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

                {showEmptyLibrary && (
                  <div className="absolute inset-0 z-[22] bg-black">
                    <KaraokeLibraryEmptyState onAddSongs={handleAddSong} />
                  </div>
                )}

                <KaraokeFullscreenLyricsOverlay
                  showLyrics={showLyrics}
                  isPlaying={isPlaying}
                  currentTrack={currentTrack}
                  coverUrl={coverUrl}
                  isOffline={isOffline}
                  currentIndex={currentIndex}
                  adjustLyricOffset={adjustLyricOffset}
                  showStatus={showStatus}
                  showOfflineStatus={showOfflineStatus}
                  handleNext={handleNext}
                  handlePrevious={handlePrevious}
                  seekToTime={seekToTime}
                  t={t}
                  controlsVisible={controlsVisible}
                  koreanDisplay={koreanDisplay}
                  japaneseFurigana={japaneseFurigana}
                  lyricsAlignment={lyricsAlignment}
                  onSwipeUp={handleFullscreenLyricsSwipeUp}
                  onSwipeDown={handleFullscreenLyricsSwipeDown}
                />
              </div>
            </div>
          )}
        </FullScreenPortal>
        </KaraokeLyricsPlaybackProvider>
      )}
    </>
  );
}
