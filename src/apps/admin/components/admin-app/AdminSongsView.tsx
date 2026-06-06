import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { MusicNote, Trash, Funnel } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import type { CachedSongMetadata } from "@/utils/songMetadataCache";
import { cn } from "@/lib/utils";
import {
  adminAvatarWellClass,
  adminGhostIconBtnClass,
  adminListDividerClass,
  adminLoadMoreBtnClass,
  adminRowHoverClass,
} from "../../utils/adminStyles";

export interface AdminSongsViewProps {
  t: TFunction;
  songs: CachedSongMetadata[];
  filteredSongs: CachedSongMetadata[];
  isLoading: boolean;
  visibleSongsCount: number;
  setVisibleSongsCount: Dispatch<SetStateAction<number>>;
  SONGS_PER_PAGE: number;
  setSelectedSongId: (id: string) => void;
  formatKugouImageUrl: (
    imgUrl: string | undefined,
    size?: number,
  ) => string | null;
  promptDelete: (
    type: "user" | "room" | "message" | "song",
    id: string,
    name: string,
  ) => void;
}

export function AdminSongsView({
  t,
  songs,
  filteredSongs,
  isLoading,
  visibleSongsCount,
  setVisibleSongsCount,
  SONGS_PER_PAGE,
  setSelectedSongId,
  formatKugouImageUrl,
  promptDelete,
}: AdminSongsViewProps) {
  return (
    <div className="w-full min-w-0 font-geneva-12">
      {songs.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
          <MusicNote className="size-8 mb-2 opacity-50" weight="bold" />
          <span className="text-[11px]">
            {t("apps.admin.songs.noSongs", "No songs in cache")}
          </span>
        </div>
      ) : filteredSongs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
          <Funnel className="size-8 mb-2 opacity-50" weight="bold" />
          <span className="text-[11px]">
            {t(
              "apps.admin.songs.noSongsMatchFilter",
              "No songs match the current filter",
            )}
          </span>
        </div>
      ) : (
        <>
          <div className={cn("w-full min-w-0", adminListDividerClass)}>
            {filteredSongs.slice(0, visibleSongsCount).map((song) => (
              <div
                key={song.youtubeId}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 px-3 py-2 cursor-pointer group",
                  adminRowHoverClass,
                )}
                onClick={() => setSelectedSongId(song.youtubeId)}
              >
                <div className={cn("size-10 flex-shrink-0 rounded overflow-hidden", adminAvatarWellClass)}>
                  <img
                    src={
                      formatKugouImageUrl(song.cover, 100) ||
                      `https://i.ytimg.com/vi/${song.youtubeId}/default.jpg`
                    }
                    alt={song.title}
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div
                    className="block w-full min-w-0 truncate text-[12px] font-medium"
                    title={song.title}
                  >
                    {song.title}
                  </div>
                  <div
                    className="block w-full min-w-0 truncate text-[11px] text-neutral-500"
                    title={song.artist}
                  >
                    {song.artist || "-"}
                  </div>
                </div>
                {song.createdBy && (
                  <span className="max-w-[5rem] shrink truncate text-[10px] text-neutral-400">
                    {song.createdBy}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    promptDelete("song", song.youtubeId, song.title);
                  }}
                  className={cn("size-6 p-0 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100", adminGhostIconBtnClass)}
                >
                  <Trash size={14} weight="bold" />
                </Button>
              </div>
            ))}
          </div>
          {filteredSongs.length > visibleSongsCount && (
            <div className="pt-2 pb-1 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setVisibleSongsCount((prev) => prev + SONGS_PER_PAGE)
                }
                className={adminLoadMoreBtnClass}
              >
                {t("apps.admin.loadMore", {
                  remaining: filteredSongs.length - visibleSongsCount,
                })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
