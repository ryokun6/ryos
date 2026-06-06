import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { ArrowLeft, ArrowsClockwise, Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatKugouImageUrl } from "./utils";
import { Skeleton } from "./Skeleton";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";
import { adminAvatarWellClass, adminDetailHeaderClass } from "../../utils/adminStyles";

type Props = Pick<
  SongDetailPanelViewModel,
  | "t"
  | "youtubeId"
  | "onBack"
  | "song"
  | "isLoading"
  | "fetchSong"
  | "setIsDeleteDialogOpen"
>;

export function SongDetailPanelHeader({
  t,
  youtubeId,
  onBack,
  song,
  isLoading,
  fetchSong,
  setIsDeleteDialogOpen,
}: Props) {
  return (
    <div className={adminDetailHeaderClass}>
      <Button variant="ghost" size="sm" onClick={onBack} className="size-6 p-0">
        <ArrowLeft className="size-3.5" weight="bold" />
      </Button>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          className={cn(
            "size-10 rounded flex items-center justify-center text-sm font-medium flex-shrink-0 overflow-hidden",
            adminAvatarWellClass,
            isLoading && "animate-pulse"
          )}
        >
          {!isLoading && (
            <img
              src={
                formatKugouImageUrl(song?.cover, 150) ||
                `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
              }
              alt=""
              className="size-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                try {
                  const url = new URL(target.src);
                  const isYouTube =
                    url.hostname === "img.youtube.com" ||
                    url.hostname === "i.ytimg.com";
                  if (!isYouTube) {
                    target.src = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
                  }
                } catch {
                  target.src = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
                }
              }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span className="text-[12px] font-medium truncate">
                {song?.title}
              </span>
            )}
          </div>
          {isLoading ? (
            <Skeleton className="h-3 w-24 mt-1" />
          ) : (
            <span className="text-[10px] text-neutral-500">
              {song?.artist ||
                t("apps.admin.song.unknownArtist", "Unknown Artist")}
            </span>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsDeleteDialogOpen(true)}
        disabled={isLoading}
        className="size-6 p-0 flex-shrink-0"
        title={t("apps.admin.song.delete", "Delete Song")}
      >
        <Trash className="size-3.5" weight="bold" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={fetchSong}
        disabled={isLoading}
        className="size-6 p-0 flex-shrink-0"
      >
        {isLoading ? (
          <ActivityIndicator size={14} />
        ) : (
          <ArrowsClockwise className="size-3.5" weight="bold" />
        )}
      </Button>
    </div>
  );
}
