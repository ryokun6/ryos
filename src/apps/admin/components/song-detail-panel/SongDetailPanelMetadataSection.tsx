import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  ArrowSquareOut,
  Clock,
  Hash,
  MusicNote,
  User,
  VinylRecord,
} from "@phosphor-icons/react";
import { formatOffset } from "./utils";
import { Skeleton } from "./Skeleton";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

type Props = Pick<
  SongDetailPanelViewModel,
  | "t"
  | "song"
  | "isLoading"
  | "isEditingTitle"
  | "isEditingArtist"
  | "isEditingAlbum"
  | "isEditingOffset"
  | "editTitle"
  | "editArtist"
  | "editAlbum"
  | "editOffset"
  | "isSaving"
  | "dispatchSongEdit"
  | "saveField"
  | "youtubeOembedTitle"
  | "isYoutubeOembedLoading"
>;

export function SongDetailPanelMetadataSection({
  t,
  song,
  isLoading,
  isEditingTitle,
  isEditingArtist,
  isEditingAlbum,
  isEditingOffset,
  editTitle,
  editArtist,
  editAlbum,
  editOffset,
  isSaving,
  dispatchSongEdit,
  saveField,
  youtubeOembedTitle,
  isYoutubeOembedLoading,
}: Props) {
  return (
    <div className="space-y-2">
      <div className="!text-[11px] uppercase tracking-wide text-black/50">
        {t("apps.admin.song.metadata", "Metadata")}
      </div>
      <div className="space-y-2">
        <div className="flex items-start gap-2 py-1.5">
          <MusicNote
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.tableHeaders.title", "Title")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-48 mt-1" />
            ) : isEditingTitle ? (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={editTitle}
                  onChange={(e) =>
                    dispatchSongEdit({
                      type: "setValue",
                      field: "editTitle",
                      value: e.target.value,
                    })
                  }
                  className="h-6 text-[11px] flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => saveField("title", editTitle)}
                  disabled={isSaving}
                  className="h-6 px-2 text-[10px]"
                >
                  {isSaving ? (
                    <ActivityIndicator size={12} />
                  ) : (
                    t("common.dialog.save")
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    dispatchSongEdit({ type: "stopEditing", field: "title" })
                  }
                  className="h-6 px-2 text-[10px]"
                >
                  {t("common.dialog.cancel")}
                </Button>
              </div>
            ) : (
              <div
                className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                onClick={() => {
                  dispatchSongEdit({
                    type: "startEdit",
                    field: "title",
                    value: song?.title || "",
                  });
                }}
              >
                {song?.title}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <User
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.tableHeaders.artist", "Artist")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : isEditingArtist ? (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={editArtist}
                  onChange={(e) =>
                    dispatchSongEdit({
                      type: "setValue",
                      field: "editArtist",
                      value: e.target.value,
                    })
                  }
                  className="h-6 text-[11px] flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => saveField("artist", editArtist)}
                  disabled={isSaving}
                  className="h-6 px-2 text-[10px]"
                >
                  {isSaving ? (
                    <ActivityIndicator size={12} />
                  ) : (
                    t("common.dialog.save")
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    dispatchSongEdit({ type: "stopEditing", field: "artist" })
                  }
                  className="h-6 px-2 text-[10px]"
                >
                  {t("common.dialog.cancel")}
                </Button>
              </div>
            ) : (
              <div
                className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                onClick={() => {
                  dispatchSongEdit({
                    type: "startEdit",
                    field: "artist",
                    value: song?.artist || "",
                  });
                }}
              >
                {song?.artist || <span className="text-neutral-400">-</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <VinylRecord
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.album", "Album")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : isEditingAlbum ? (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={editAlbum}
                  onChange={(e) =>
                    dispatchSongEdit({
                      type: "setValue",
                      field: "editAlbum",
                      value: e.target.value,
                    })
                  }
                  className="h-6 text-[11px] flex-1"
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => saveField("album", editAlbum)}
                  disabled={isSaving}
                  className="h-6 px-2 text-[10px]"
                >
                  {isSaving ? (
                    <ActivityIndicator size={12} />
                  ) : (
                    t("common.dialog.save")
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    dispatchSongEdit({ type: "stopEditing", field: "album" })
                  }
                  className="h-6 px-2 text-[10px]"
                >
                  {t("common.dialog.cancel")}
                </Button>
              </div>
            ) : (
              <div
                className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                onClick={() => {
                  dispatchSongEdit({
                    type: "startEdit",
                    field: "album",
                    value: song?.album || "",
                  });
                }}
              >
                {song?.album || <span className="text-neutral-400">-</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <Clock
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.lyricsOffset", "Lyrics Offset")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-24 mt-1" />
            ) : isEditingOffset ? (
              <div className="flex items-center gap-1 mt-1">
                <Input
                  type="number"
                  value={editOffset}
                  onChange={(e) =>
                    dispatchSongEdit({
                      type: "setValue",
                      field: "editOffset",
                      value: e.target.value,
                    })
                  }
                  className="h-6 text-[11px] flex-1"
                  autoFocus
                />
                <span className="text-[10px] text-neutral-400">ms</span>
                <Button
                  size="sm"
                  onClick={() => saveField("lyricOffset", editOffset)}
                  disabled={isSaving}
                  className="h-6 px-2 text-[10px]"
                >
                  {isSaving ? (
                    <ActivityIndicator size={12} />
                  ) : (
                    t("common.dialog.save")
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    dispatchSongEdit({ type: "stopEditing", field: "offset" })
                  }
                  className="h-6 px-2 text-[10px]"
                >
                  {t("common.dialog.cancel")}
                </Button>
              </div>
            ) : (
              <div
                className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                onClick={() => {
                  dispatchSongEdit({
                    type: "startEdit",
                    field: "offset",
                    value: String(song?.lyricOffset || 0),
                  });
                }}
              >
                {formatOffset(song?.lyricOffset)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <Hash
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.youtubeId", "YouTube ID")}
            </div>
            {isLoading ? (
              <div className="space-y-1 mt-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-28" />
              </div>
            ) : (
              <>
                {isYoutubeOembedLoading ? (
                  <Skeleton className="h-4 w-48 mt-0.5" />
                ) : youtubeOembedTitle ? (
                  <div
                    className="text-[11px] mt-0.5 truncate"
                    title={youtubeOembedTitle}
                  >
                    {youtubeOembedTitle}
                  </div>
                ) : null}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[11px] font-mono">{song?.id}</span>
                  <a
                    href={`https://www.youtube.com/watch?v=${song?.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <ArrowSquareOut className="size-3" weight="bold" />
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
