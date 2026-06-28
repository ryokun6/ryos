import { AnimatePresence, motion } from "motion/react";
import { Suspense } from "react";
import { IPOD_MODERN_SCREEN_HEIGHT_PX } from "../../constants";
import { IpodScreen } from "../ipod-screen/IpodScreen";
import type { IpodAppController } from "./useIpodAppController";
import { useIpodScreenLongPressHandlers } from "./useIpodScreenLongPressHandlers";
import { BrickGame, CoverFlow, MusicQuiz } from "./ipodLazyImports";

type IpodScreenAreaProps = {
  c: IpodAppController;
};

export function IpodScreenArea({ c }: IpodScreenAreaProps) {
  const {
    tracks,
    coverFlowTracks,
    currentIndex,
    coverFlowCurrentIndex,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    playbackRequested,
    showVideo,
    backlightOn,
    lcdFilterOn,
    effectiveDisplayMode,
    showLyrics,
    lyricsAlignment,
    lyricOffset,
    adjustLyricOffset,
    registerActivity,
    isFullScreen,
    fullScreenLyricsControls,
    furiganaMap,
    soramimiMap,
    activityState,
    appleMusicMenuTitlebarLoading,
    fastScrollLetter,
    isCoverFlowOpen,
    isMusicQuizOpen,
    setIsMusicQuizOpen,
    musicQuizRef,
    isBrickGameOpen,
    setIsBrickGameOpen,
    brickGameRef,
    playClickSound,
    playScrollSound,
    vibrate,
    menuMode,
    menuHistory,
    selectedMenuItem,
    setSelectedMenuItem,
    menuDirection,
    handleMenuItemAction,
    totalTime,
    nowPlayingScope,
    statusMessage,
    playerRef,
    handleTrackEnd,
    handleProgress,
    handleDuration,
    handlePlay,
    handlePause,
    handleReady,
    handlePlaybackAttemptFailed,
    toggleVideo,
    ipodVolume,
    showStatus,
    isOffline,
    showOfflineStatus,
    skipOperationRef,
    startTrackSwitch,
    nextTrack,
    previousTrack,
    coverFlowRef,
    handleCoverFlowSelect,
    handleCoverFlowExit,
    handleCoverFlowRotation,
    handleCoverFlowPlayInPlace,
    togglePlay,
    isAppleMusic,
    isModernIpodUi,
    handleCenterLongPress,
    screenLongPressTimerRef,
    screenLongPressFiredRef,
    screenLongPressStartPos,
    SCREEN_LONG_PRESS_MOVE_THRESHOLD,
  } = c;

  const longPressHandlers = useIpodScreenLongPressHandlers(
    {
      screenLongPressTimerRef,
      screenLongPressFiredRef,
      screenLongPressStartPos,
      SCREEN_LONG_PRESS_MOVE_THRESHOLD,
    },
    handleCenterLongPress
  );

  return (
    <div
      className="relative w-full"
      style={{
        height: IPOD_MODERN_SCREEN_HEIGHT_PX,
        minHeight: IPOD_MODERN_SCREEN_HEIGHT_PX,
        maxHeight: IPOD_MODERN_SCREEN_HEIGHT_PX,
      }}
      {...longPressHandlers}
    >
      <IpodScreen
        currentTrack={tracks[currentIndex] || null}
        isPlaying={isPlaying && !isFullScreen}
        playbackRequested={playbackRequested && !isFullScreen}
        totalTime={totalTime}
        menuMode={menuMode}
        menuHistory={menuHistory}
        selectedMenuItem={selectedMenuItem}
        onSelectMenuItem={setSelectedMenuItem}
        currentIndex={nowPlayingScope.index}
        tracksLength={nowPlayingScope.total}
        backlightOn={backlightOn}
        menuDirection={menuDirection}
        onMenuItemAction={handleMenuItemAction}
        showVideo={showVideo}
        displayMode={effectiveDisplayMode}
        playerRef={playerRef}
        handleTrackEnd={handleTrackEnd}
        handleProgress={handleProgress}
        handleDuration={handleDuration}
        handlePlay={handlePlay}
        handlePause={handlePause}
        handleReady={handleReady}
        handlePlaybackAttemptFailed={handlePlaybackAttemptFailed}
        loopCurrent={loopCurrent}
        loopAll={loopAll}
        isShuffled={isShuffled}
        statusMessage={statusMessage}
        onToggleVideo={toggleVideo}
        lcdFilterOn={lcdFilterOn}
        ipodVolume={ipodVolume}
        showStatusCallback={showStatus}
        showLyrics={showLyrics}
        lyricsAlignment={lyricsAlignment}
        lyricOffset={lyricOffset ?? 0}
        adjustLyricOffset={(delta) => adjustLyricOffset(currentIndex, delta)}
        registerActivity={registerActivity}
        isFullScreen={isFullScreen}
        lyricsControls={fullScreenLyricsControls}
        furiganaMap={furiganaMap}
        soramimiMap={soramimiMap}
        activityState={activityState}
        appleMusicMenuTitlebarLoading={appleMusicMenuTitlebarLoading}
        fastScrollLetter={fastScrollLetter}
        isCoverFlowOpen={isCoverFlowOpen}
        coverFlowSlot={
          isModernIpodUi ? (
            <Suspense fallback={null}>
              <CoverFlow
                ref={coverFlowRef}
                tracks={coverFlowTracks}
                currentIndex={coverFlowCurrentIndex}
                onSelectTrack={handleCoverFlowSelect}
                onExit={handleCoverFlowExit}
                onRotation={handleCoverFlowRotation}
                isVisible={isCoverFlowOpen}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
                onPlayTrackInPlace={handleCoverFlowPlayInPlace}
                groupAppleMusicAlbums={isAppleMusic}
                inline
              />
            </Suspense>
          ) : undefined
        }
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

      {!isModernIpodUi && isCoverFlowOpen && (
        <Suspense fallback={null}>
          <CoverFlow
            ref={coverFlowRef}
            tracks={coverFlowTracks}
            currentIndex={coverFlowCurrentIndex}
            onSelectTrack={handleCoverFlowSelect}
            onExit={handleCoverFlowExit}
            onRotation={handleCoverFlowRotation}
            isVisible={isCoverFlowOpen}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onPlayTrackInPlace={handleCoverFlowPlayInPlace}
            groupAppleMusicAlbums={isAppleMusic}
          />
        </Suspense>
      )}

      <AnimatePresence mode="wait">
        {isMusicQuizOpen ? (
          <motion.div
            key="music-quiz"
            className="absolute inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <Suspense
              fallback={<div className="absolute inset-0 z-40 pointer-events-auto" />}
            >
              <MusicQuiz
                ref={musicQuizRef}
                isVisible={isMusicQuizOpen}
                onExit={() => setIsMusicQuizOpen(false)}
                lcdFilterOn={lcdFilterOn}
                backlightOn={backlightOn}
                playClick={playClickSound}
                playScroll={playScrollSound}
                vibrate={vibrate}
              />
            </Suspense>
          </motion.div>
        ) : null}
        {isBrickGameOpen ? (
          <motion.div
            key="brick-game"
            className="absolute inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
          >
            <Suspense
              fallback={<div className="absolute inset-0 z-40 pointer-events-auto" />}
            >
              <BrickGame
                ref={brickGameRef}
                isVisible={isBrickGameOpen}
                onExit={() => setIsBrickGameOpen(false)}
                lcdFilterOn={lcdFilterOn}
                backlightOn={backlightOn}
                playClick={playClickSound}
                playScroll={playScrollSound}
                vibrate={vibrate}
              />
            </Suspense>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
