import { FullScreenPortal } from "@/apps/ipod/components/FullScreenPortal";
import { ReactionOverlay } from "@/components/listen/ReactionOverlay";
import {
  selectEffectiveIpodVolume,
  useAudioSettingsStore,
} from "@/stores/useAudioSettingsStore";
import { PLAYER_PROGRESS_INTERVAL_MS } from "@/apps/ipod/constants";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { DisplayMode } from "@/types/lyrics";
import { KtvAmbientReactions } from "../KtvAmbientReactions";
import { KaraokeLibraryEmptyState } from "../KaraokeLibraryEmptyState";
import {
  KaraokeLyricsPlaybackProvider,
  KaraokeFullscreenLyricsOverlay,
  KaraokeSyncModeFullscreenPanel,
} from "../karaoke-lyrics-playback";
import { KaraokeVisualLayers } from "./KaraokeVisualLayers";
import type { KaraokeAppController } from "./useKaraokeAppController";

type KaraokeFullscreenViewProps = { c: KaraokeAppController; isForeground: boolean | undefined };

export function KaraokeFullscreenView({ c, isForeground }: KaraokeFullscreenViewProps) {
  const effectiveIpodVolume = useAudioSettingsStore(selectEffectiveIpodVolume);
  const {
    isFullScreen, toggleFullScreen, handlePlayPause, handleNext, handlePrevious,
    isListenSessionRemoteOnly, getCurrentKaraokeTrack, showStatus, showOfflineStatus,
    registerActivity, isPlaying, playbackRequested, statusMessage, lyricsTranslationLanguage,
    setLyricsTranslationLanguage, lyricsAlignment, cycleAlignment, lyricsFont,
    cycleLyricsFont, romanization, setRomanization, setIsSyncModeOpen, isSyncModeOpen,
    displayMode, handleDisplayModeSelect, displayModeOptions, karaokeKtvRoomFx,
    currentTrack, currentIndex, duration, setLyricOffset,
    adjustLyricOffset, fullScreenPlayerRef, playerRef, closeSyncMode, handleRefreshLyrics,
    t, seekTime, loopCurrent, handleTrackEnd, handleProgress, handlePlay, handlePause,
    handleReady, handlePlaybackAttemptFailed, effectiveDisplayMode, visualBackgroundActive, coverUrl,
    showEmptyLibrary, handleAddSong, listenSession,     showLyrics, isOffline, seekToTime,
    handleFullscreenLyricsSwipeUp, handleFullscreenLyricsSwipeDown,
    lyricsSourceOverride, isAddingSong, setIsLyricsSearchDialogOpen, auth, lyricsPlaybackSyncRef,
  } = c;

  if (!isFullScreen) return null;

  return (
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
                    <YouTubePlayer
                      ref={fullScreenPlayerRef}
                      url={currentTrack.url}
                      playing={
                        playbackRequested &&
                        isFullScreen &&
                        !isListenSessionRemoteOnly
                      }
                      controls
                      width="100%"
                      height="100%"
                      volume={effectiveIpodVolume}
                      loop={loopCurrent}
                      onEnded={handleTrackEnd}
                      onProgress={handleProgress}
                      progressInterval={PLAYER_PROGRESS_INTERVAL_MS}
                      onPlay={handlePlay}
                      onPause={handlePause}
                      onReady={isFullScreen ? handleReady : undefined}
                      onPlaybackAttemptFailed={handlePlaybackAttemptFailed}
                      config={{
                        youtube: {
                          playerVars: {
                            cc_load_policy: 0,
                            fs: 1,
                          },
                        },
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <KaraokeVisualLayers
              effectiveDisplayMode={effectiveDisplayMode}
              visualBackgroundActive={visualBackgroundActive}
              currentTrack={currentTrack}
              coverUrl={coverUrl}
              isPlaying={isPlaying}
              layerClassName="fixed inset-0 z-[5]"
              coverOverlayClassName="fixed inset-0 z-15"
              onCoverInteraction={registerActivity}
            />

                            {showEmptyLibrary && (
              <div className="absolute inset-0 z-[22] bg-black">
                <KaraokeLibraryEmptyState onAddSongs={handleAddSong} />
              </div>
            )}

            {!isSyncModeOpen && listenSession && (
              <ReactionOverlay className="absolute inset-0 z-[15]" />
            )}
            {!isSyncModeOpen && !listenSession && (
              <KtvAmbientReactions
                enabled={
                  karaokeKtvRoomFx &&
                  Boolean(currentTrack) &&
                  (isForeground ?? true)
                }
                isPlaying={
                  isPlaying &&
                  Boolean(currentTrack) &&
                  !isListenSessionRemoteOnly
                }
              />
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
              lyricsAlignment={lyricsAlignment}
              onSwipeUp={handleFullscreenLyricsSwipeUp}
              onSwipeDown={handleFullscreenLyricsSwipeDown}
            />
          </div>
        </div>
      )}
    </FullScreenPortal>
    </KaraokeLyricsPlaybackProvider>
  );
}
