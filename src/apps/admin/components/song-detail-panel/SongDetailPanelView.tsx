import { ScrollArea } from "@/components/ui/scroll-area";
import { SongDetailPanelActions } from "./SongDetailPanelActions";
import { SongDetailPanelDialogs } from "./SongDetailPanelDialogs";
import { SongDetailPanelHeader } from "./SongDetailPanelHeader";
import { SongDetailPanelInfoSection } from "./SongDetailPanelInfoSection";
import { SongDetailPanelLyricsSection } from "./SongDetailPanelLyricsSection";
import { SongDetailPanelMetadataSection } from "./SongDetailPanelMetadataSection";
import { SongDetailPanelNotFound } from "./SongDetailPanelNotFound";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

export function SongDetailPanelView(vm: SongDetailPanelViewModel) {
  const { isLoading, song, onBack, t } = vm;

  if (!isLoading && !song) {
    return <SongDetailPanelNotFound t={t} onBack={onBack} />;
  }

  return (
    <div className="flex flex-col h-full font-geneva-12">
      <SongDetailPanelHeader
        t={vm.t}
        youtubeId={vm.youtubeId}
        onBack={vm.onBack}
        song={vm.song}
        isLoading={vm.isLoading}
        fetchSong={vm.fetchSong}
        setIsDeleteDialogOpen={vm.setIsDeleteDialogOpen}
      />

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <SongDetailPanelActions
            t={vm.t}
            song={vm.song}
            isLoading={vm.isLoading}
            isForceRefreshing={vm.isForceRefreshing}
            isUnsharing={vm.isUnsharing}
            isAppleMusic={vm.isAppleMusic}
            appleMusicWebUrl={vm.appleMusicWebUrl}
            handleOpenInAppleMusic={vm.handleOpenInAppleMusic}
            handlePlayInIpod={vm.handlePlayInIpod}
            handlePlayInKaraoke={vm.handlePlayInKaraoke}
            setIsLyricsSearchDialogOpen={vm.setIsLyricsSearchDialogOpen}
            handleForceRefresh={vm.handleForceRefresh}
            setIsUnshareDialogOpen={vm.setIsUnshareDialogOpen}
          />

          <SongDetailPanelMetadataSection
            t={vm.t}
            song={vm.song}
            isLoading={vm.isLoading}
            isEditingTitle={vm.isEditingTitle}
            isEditingArtist={vm.isEditingArtist}
            isEditingAlbum={vm.isEditingAlbum}
            isEditingOffset={vm.isEditingOffset}
            editTitle={vm.editTitle}
            editArtist={vm.editArtist}
            editAlbum={vm.editAlbum}
            editOffset={vm.editOffset}
            isSaving={vm.isSaving}
            dispatchSongEdit={vm.dispatchSongEdit}
            saveField={vm.saveField}
            isAppleMusic={vm.isAppleMusic}
            appleMusicKindLabel={vm.appleMusicKindLabel}
            appleMusicWebUrl={vm.appleMusicWebUrl}
            youtubeOembedTitle={vm.youtubeOembedTitle}
            isYoutubeOembedLoading={vm.isYoutubeOembedLoading}
          />

          <SongDetailPanelLyricsSection
            t={vm.t}
            song={vm.song}
            isLoading={vm.isLoading}
          />

          <SongDetailPanelInfoSection
            t={vm.t}
            song={vm.song}
            isLoading={vm.isLoading}
            formatRelativeTime={vm.formatRelativeTime}
          />
        </div>
      </ScrollArea>

      <SongDetailPanelDialogs
        t={vm.t}
        youtubeId={vm.youtubeId}
        song={vm.song}
        isDeleteDialogOpen={vm.isDeleteDialogOpen}
        setIsDeleteDialogOpen={vm.setIsDeleteDialogOpen}
        isUnshareDialogOpen={vm.isUnshareDialogOpen}
        setIsUnshareDialogOpen={vm.setIsUnshareDialogOpen}
        handleDelete={vm.handleDelete}
        handleUnshare={vm.handleUnshare}
        isLyricsSearchDialogOpen={vm.isLyricsSearchDialogOpen}
        setIsLyricsSearchDialogOpen={vm.setIsLyricsSearchDialogOpen}
        handleLyricsSearchSelect={vm.handleLyricsSearchSelect}
        handleLyricsSearchReset={vm.handleLyricsSearchReset}
      />
    </div>
  );
}
