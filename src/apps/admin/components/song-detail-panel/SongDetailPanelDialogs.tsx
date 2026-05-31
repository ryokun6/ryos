import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

type Props = Pick<
  SongDetailPanelViewModel,
  | "t"
  | "youtubeId"
  | "song"
  | "isDeleteDialogOpen"
  | "setIsDeleteDialogOpen"
  | "isUnshareDialogOpen"
  | "setIsUnshareDialogOpen"
  | "handleDelete"
  | "handleUnshare"
  | "isLyricsSearchDialogOpen"
  | "setIsLyricsSearchDialogOpen"
  | "handleLyricsSearchSelect"
  | "handleLyricsSearchReset"
>;

export function SongDetailPanelDialogs({
  t,
  youtubeId,
  song,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  isUnshareDialogOpen,
  setIsUnshareDialogOpen,
  handleDelete,
  handleUnshare,
  isLyricsSearchDialogOpen,
  setIsLyricsSearchDialogOpen,
  handleLyricsSearchSelect,
  handleLyricsSearchReset,
}: Props) {
  return (
    <>
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        title={t("apps.admin.dialogs.deleteTitle", {
          type: t("common.dialog.share.itemTypes.song"),
        })}
        description={t("apps.admin.dialogs.deleteDescription", {
          type: t("common.dialog.share.itemTypes.song"),
          name: song?.title || youtubeId,
        })}
      />
      <ConfirmDialog
        isOpen={isUnshareDialogOpen}
        onOpenChange={setIsUnshareDialogOpen}
        onConfirm={handleUnshare}
        title={t("apps.admin.dialogs.unshareTitle", "Unshare Song")}
        description={t("apps.admin.dialogs.unshareDescription", {
          name: song?.title || youtubeId,
          user: song?.createdBy || "",
          defaultValue: `This will remove "${song?.title || youtubeId}" from ${song?.createdBy || "user"}'s shared songs. The song will remain in the library but won't be associated with any user.`,
        })}
      />
      {song && (
        <LyricsSearchDialog
          isOpen={isLyricsSearchDialogOpen}
          onOpenChange={setIsLyricsSearchDialogOpen}
          trackId={song.id}
          trackTitle={song.title}
          trackArtist={song.artist}
          initialQuery={`${song.title} ${song.artist || ""}`.trim()}
          onSelect={handleLyricsSearchSelect}
          onReset={handleLyricsSearchReset}
          hasOverride={!!song.lyricsSource}
          currentSelection={
            song.lyricsSource
              ? {
                  title: song.lyricsSource.title,
                  artist: song.lyricsSource.artist,
                  album: song.lyricsSource.album,
                  cover: song.cover,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
