import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  adminAquaIconButtonClass,
  AQUA_ICON_BUTTON_ICON_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
} from "@/lib/aquaIconButton";
import {
  ArrowCounterClockwise,
  MagnifyingGlass,
  Microphone,
  MusicNote,
  UserMinus,
} from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

type Props = Pick<
  SongDetailPanelViewModel,
  | "t"
  | "song"
  | "isLoading"
  | "isForceRefreshing"
  | "isUnsharing"
  | "handlePlayInIpod"
  | "handlePlayInKaraoke"
  | "setIsLyricsSearchDialogOpen"
  | "handleForceRefresh"
  | "setIsUnshareDialogOpen"
>;

export function SongDetailPanelActions({
  t,
  song,
  isLoading,
  isForceRefreshing,
  isUnsharing,
  handlePlayInIpod,
  handlePlayInKaraoke,
  setIsLyricsSearchDialogOpen,
  handleForceRefresh,
  setIsUnshareDialogOpen,
}: Props) {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-28" />
      </div>
    );
  }

  if (!song) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handlePlayInIpod}
        className={adminAquaIconButtonClass("secondary")}
      >
        <MusicNote className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
        <span>{t("apps.admin.song.playInIpod", "Play in iPod")}</span>
      </button>
      <button
        onClick={handlePlayInKaraoke}
        className={adminAquaIconButtonClass("secondary")}
      >
        <Microphone className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
        <span>{t("apps.admin.song.playInKaraoke", "Play in Karaoke")}</span>
      </button>
      <button
        onClick={() => setIsLyricsSearchDialogOpen(true)}
        className={adminAquaIconButtonClass("secondary")}
      >
        <MagnifyingGlass className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
        <span>{t("apps.admin.song.searchLyrics", "Search Lyrics")}</span>
      </button>
      {song.lyricsSource && (
        <button
          onClick={handleForceRefresh}
          disabled={isForceRefreshing}
          className={adminAquaIconButtonClass("secondary")}
          title={t(
            "apps.admin.song.forceRefreshTooltip",
            "Re-fetch lyrics from Kugou and clear cached annotations"
          )}
        >
          {isForceRefreshing ? (
            <ActivityIndicator size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE} />
          ) : (
            <ArrowCounterClockwise
              className={AQUA_ICON_BUTTON_ICON_CLASS}
              weight="bold"
            />
          )}
          <span>{t("apps.admin.song.forceRefresh", "Force Refresh")}</span>
        </button>
      )}
      {song.createdBy && (
        <button
          onClick={() => setIsUnshareDialogOpen(true)}
          disabled={isUnsharing}
          className={adminAquaIconButtonClass("secondary")}
        >
          {isUnsharing ? (
            <ActivityIndicator size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE} />
          ) : (
            <UserMinus className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
          )}
          <span>{t("apps.admin.song.unshare", "Unshare")}</span>
        </button>
      )}
    </div>
  );
}
