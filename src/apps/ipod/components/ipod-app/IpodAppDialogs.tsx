import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog } from "@/components/dialogs/SongSearchDialog";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { appMetadata } from "../..";
import type { IpodAppController } from "./useIpodAppController";

type IpodAppDialogsProps = {
  c: IpodAppController;
};

export function IpodAppDialogs({ c }: IpodAppDialogsProps) {
  const {
    t,
    translatedHelpItems,
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
    tracks,
    currentIndex,
    currentTrack,
    lyricsSourceOverride,
    clearLibrary,
    showStatus,
    ipodGenerateShareUrl,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleSongSearchSelect,
    handleAddUrl,
    isAppleMusic,
    appleMusicAuthorized,
    handleAppleMusicSearch,
    handleAppleMusicSearchSelect,
    lyricsTitle,
    lyricsArtist,
    lyricsSongId,
    isFullScreen,
    isSyncModeOpen,
    fullScreenLyricsControls,
    elapsedTime,
    totalTime,
    lyricOffset,
    romanization,
    furiganaMap,
    setLyricOffset,
    adjustLyricOffset,
    playerRef,
    closeSyncMode,
  } = c;

  return (
    <>
      <AppHelpAboutDialogs
        appId="ipod"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
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
          trackId={lyricsSongId || currentTrack.id}
          trackTitle={lyricsTitle}
          trackArtist={lyricsArtist}
          initialQuery={`${lyricsTitle} ${lyricsArtist || ""}`.trim()}
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
        mode={isAppleMusic ? "appleMusic" : "youtube"}
        appleMusicAuthorized={appleMusicAuthorized}
        onAppleMusicSearch={handleAppleMusicSearch}
        onAppleMusicSelect={handleAppleMusicSearchSelect}
      />
      {!isFullScreen &&
        isSyncModeOpen &&
        fullScreenLyricsControls.originalLines.length > 0 && (
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
    </>
  );
}
