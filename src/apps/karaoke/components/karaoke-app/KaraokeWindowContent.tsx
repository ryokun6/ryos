import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { CoverFlow } from "@/apps/ipod/components/cover-flow/CoverFlow";
import { ReactionOverlay } from "@/components/listen/ReactionOverlay";
import { ListenSessionToolbar } from "@/components/listen/ListenSessionToolbar";
import { FullscreenPlayerControls } from "@/components/shared/FullscreenPlayerControls";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { PLAYER_PROGRESS_INTERVAL_MS } from "@/apps/ipod/constants";
import { DisplayMode } from "@/types/lyrics";
import { KaraokeIosAutoplayWatchdog } from "../KaraokeIosAutoplayWatchdog";
import { KaraokeLibraryEmptyState } from "../KaraokeLibraryEmptyState";
import {
  KaraokeLyricsPlaybackProvider,
  KaraokeWindowLyricsOverlay,
  KaraokeLyricsActivityIndicator,
  KaraokeSyncModeWindowPanel,
} from "../karaoke-lyrics-playback";
import { KaraokeVisualLayers } from "./KaraokeVisualLayers";
import type { KaraokeAppController } from "./useKaraokeAppController";

type KaraokeWindowContentProps = { c: KaraokeAppController };

export function KaraokeWindowContent({ c }: KaraokeWindowContentProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null
  );
  const {
    t, tracks, currentIndex, loopCurrent, isPlaying, isFullScreen, showLyrics,
    lyricsAlignment, lyricsFont, koreanDisplay, japaneseFurigana, romanization,
    setRomanization, lyricsTranslationLanguage, setLyricsTranslationLanguage,
    isShuffled, toggleShuffle, isListenSessionRemoteOnly, isOffline, isLangMenuOpen,
    setIsLangMenuOpen, isPronunciationMenuOpen, setIsPronunciationMenuOpen, anyMenuOpen,
    isSyncModeOpen, isCoverFlowOpen, setIsCoverFlowOpen, coverFlowRef,
    screenLongPressTimerRef, screenLongPressFiredRef, longPressStartPos, LONG_PRESS_MOVE_THRESHOLD,
    playerRef, lyricsPlaybackSyncRef, duration, statusMessage, showControls, ipodVolume,
    userHasInteractedRef, currentTrack, lyricsSourceOverride, coverUrl, translationLanguages,
    listenSession, listenSessionUsername, listenSessionClientInstanceId, listenListenerCount,
    isListenSessionHost, isListenSessionDj, isListenSessionAnonymous, showEmptyLibrary,
    effectiveDisplayMode, visualBackgroundActive, auth, isAddingSong, setIsLyricsSearchDialogOpen,
    adjustLyricOffset, showStatus, showOfflineStatus, handleNext, handlePrevious, seekToTime,
    handleOpenCoverFlowFromTitleCard, setLyricOffset, closeSyncMode, handleRefreshLyrics,
    handleCoverFlowSelectTrack, handleCoverFlowRotation, handleCoverFlowPlayInPlace,
    handlePlayPause, handleTrackEnd, handleProgress, setDuration, handlePlay, handleMainPlayerPause,
    handleReady, handleToggleCoverFlow, handleAddSong, restartAutoHideTimer, setIsPlaying,
    setIsSyncModeOpen, setIsListenInviteOpen, handleLeaveListenSession, handleAssignPlaybackDevice,
    handlePassDj, handleTransferSessionHost, handleSendReaction, cycleAlignment, cycleLyricsFont,
    displayMode, handleDisplayModeSelect, displayModeOptions,
  } = c;

  return (
    <div
      ref={setPortalContainer}
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
      {listenSession && !isSyncModeOpen && !isFullScreen && (
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
            <YouTubePlayer
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
                    cc_load_policy: 0,
                    fs: 0,
                    controls: 0,
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

      <KaraokeVisualLayers
        effectiveDisplayMode={effectiveDisplayMode}
        visualBackgroundActive={visualBackgroundActive}
        currentTrack={currentTrack}
        coverUrl={coverUrl}
        isPlaying={isPlaying}
        layerClassName="absolute inset-0 z-[5]"
        coverOverlayClassName="absolute inset-0 z-15"
        onCoverInteraction={() => {
          userHasInteractedRef.current = true;
          restartAutoHideTimer();
        }}
      />

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
          portalContainer={portalContainer}
        />
      </div>
    </div>
  );
}
