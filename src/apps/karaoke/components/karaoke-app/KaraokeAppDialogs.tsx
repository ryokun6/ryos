import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog } from "@/components/dialogs/SongSearchDialog";
import { ListenSessionInvite } from "@/components/listen/ListenSessionInvite";
import { JoinSessionDialog } from "@/components/listen/JoinSessionDialog";
import { appMetadata } from "../..";
import type { KaraokeAppController } from "./useKaraokeAppController";

type KaraokeAppDialogsProps = {
  c: KaraokeAppController;
};

export function KaraokeAppDialogs({ c }: KaraokeAppDialogsProps) {
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
    isListenInviteOpen,
    setIsListenInviteOpen,
    isJoinListenDialogOpen,
    setIsJoinListenDialogOpen,
    tracks,
    currentIndex,
    currentTrack,
    lyricsSourceOverride,
    clearLibrary,
    showStatus,
    karaokeGenerateShareUrl,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handleSongSearchSelect,
    handleAddUrl,
    listenSession,
    handleJoinListenSession,
  } = c;

  return (
    <>
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
    </>
  );
}
