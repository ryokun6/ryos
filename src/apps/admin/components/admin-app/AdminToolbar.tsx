import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  Trash,
  ArrowsClockwise,
  Funnel,
  DownloadSimple,
  UploadSimple,
} from "@phosphor-icons/react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { cn } from "@/lib/utils";
import type { AdminSection } from "../../utils/navigationState";
import type { TFunction } from "i18next";
import type { AdminImportStatus } from "./adminImportStatus";

interface RoomLite {
  id: string;
  name: string;
}

interface AdminToolbarProps {
  t: TFunction;
  currentTheme: string;
  isXpTheme: boolean;
  activeSection: AdminSection;
  selectedRoomId: string | null;
  selectedRoom: RoomLite | null;
  roomMessages: { length: number };
  userSearch: string;
  setUserSearch: (v: string) => void;
  songSearch: string;
  setSongSearch: (v: string) => void;
  songsFilterByRyoOnly: boolean;
  setSongsFilterByRyoOnly: Dispatch<SetStateAction<boolean>>;
  songs: { length: number };
  isImporting: boolean;
  isExporting: boolean;
  isDeletingAll: boolean;
  importStatus: AdminImportStatus;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleImportFile: (e: ChangeEvent<HTMLInputElement>) => void;
  handleExportLibrary: () => void;
  handleDeleteAllSongs: () => void;
  handleRefresh: () => void;
  isLoading: boolean;
  promptDelete: (
    type: "user" | "room" | "message" | "song",
    id: string,
    name: string,
  ) => void;
}

export function AdminToolbar({
  t,
  currentTheme,
  isXpTheme,
  activeSection,
  selectedRoomId,
  selectedRoom,
  roomMessages,
  userSearch,
  setUserSearch,
  songSearch,
  setSongSearch,
  songsFilterByRyoOnly,
  setSongsFilterByRyoOnly,
  songs,
  isImporting,
  isExporting,
  isDeletingAll,
  importStatus,
  fileInputRef,
  handleImportFile,
  handleExportLibrary,
  handleDeleteAllSongs,
  handleRefresh,
  isLoading,
  promptDelete,
}: AdminToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 border-b",
        isXpTheme
          ? "border-[#919b9c]"
          : currentTheme === "macosx"
            ? "border-black/10"
            : "border-black/20",
      )}
      style={
        currentTheme === "macosx"
          ? { backgroundImage: "var(--os-pinstripe-window)" }
          : undefined
      }
    >
      {activeSection === "users" && !selectedRoomId && (
        <SearchInput
          placeholder={t("apps.admin.search.placeholder")}
          value={userSearch}
          onChange={setUserSearch}
          className="flex-1"
          inputClassName="h-7 text-[12px]"
        />
      )}

      {activeSection === "songs" && !selectedRoomId && (
        <>
          <SearchInput
            placeholder={t(
              "apps.admin.search.songsPlaceholder",
              "Search songs...",
            )}
            value={songSearch}
            onChange={setSongSearch}
            className="flex-1"
            inputClassName="h-7 text-[12px]"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSongsFilterByRyoOnly((v) => !v)}
            className={cn("size-7 p-0", songsFilterByRyoOnly && "bg-neutral-200")}
            title={t(
              "apps.admin.songs.filterByRyo",
              "Filter: songs created by ryo",
            )}
          >
            <Funnel
              size={14}
              weight={songsFilterByRyoOnly ? "fill" : "bold"}
            />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting || isExporting || isDeletingAll}
            className="size-7 p-0"
            title={
              isImporting
                ? t("apps.admin.songs.importing", {
                    processed: importStatus.processedSongs,
                    total: importStatus.totalSongs,
                    defaultValue:
                      importStatus.totalSongs > 0
                        ? `Importing ${importStatus.processedSongs}/${importStatus.totalSongs}`
                        : "Importing library...",
                  })
                : t("apps.admin.songs.import", "Import Library")
            }
          >
            {isImporting ? (
              <ActivityIndicator size={14} />
            ) : (
              <DownloadSimple size={14} weight="bold" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportLibrary}
            disabled={
              isExporting || isImporting || isDeletingAll || songs.length === 0
            }
            className="size-7 p-0"
            title={t("apps.admin.songs.export", "Export Library")}
          >
            {isExporting ? (
              <ActivityIndicator size={14} />
            ) : (
              <UploadSimple size={14} weight="bold" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteAllSongs}
            disabled={isDeletingAll || isImporting || songs.length === 0}
            className="size-7 p-0"
            title={t("apps.admin.songs.deleteAll", "Delete All Songs")}
          >
            {isDeletingAll ? (
              <ActivityIndicator size={14} />
            ) : (
              <Trash size={14} weight="bold" />
            )}
          </Button>
        </>
      )}

      {selectedRoomId && selectedRoom && (
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[12px] font-medium"># {selectedRoom.name}</span>
          <span className="text-[11px] text-neutral-500">
            {t("apps.admin.room.messagesCount", {
              count: roomMessages.length,
            })}
          </span>
        </div>
      )}

      {selectedRoomId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            promptDelete("room", selectedRoomId, selectedRoom?.name || "")
          }
          className="size-7 p-0"
        >
          <Trash size={14} weight="bold" />
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRefresh}
        className="size-7 p-0"
      >
        {isLoading ? (
          <ActivityIndicator size={14} />
        ) : (
          <ArrowsClockwise size={14} weight="bold" />
        )}
      </Button>
    </div>
  );
}
