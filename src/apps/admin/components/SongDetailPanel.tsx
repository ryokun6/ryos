import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash2,
  Music,
  Clock,
  User,
  Disc,
  Hash,
  ExternalLink,
  Languages,
  FileText,
  Type,
  AlertTriangle,
  Play,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { deleteSongMetadata, saveSongMetadata, CachedLyricsSource } from "@/utils/songMetadataCache";
import { getApiUrl } from "@/utils/platform";
import { ActivityIndicator } from "@/components/ui/activity-indicator";

interface LyricsContent {
  lrc?: string;
  krc?: string;
  cover?: string;
  parsedLines?: Array<{ startTimeMs: string; words: string }>;
}

interface SongDetail {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  lyrics?: LyricsContent;
  translations?: Record<string, string>;
  furigana?: Array<Array<{ text: string; reading?: string }>>;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

interface SongDetailPanelProps {
  youtubeId: string;
  onBack: () => void;
  onSongDeleted: () => void;
}

export const SongDetailPanel: React.FC<SongDetailPanelProps> = ({
  youtubeId,
  onBack,
  onSongDeleted,
}) => {
  const { t } = useTranslation();
  const { username, authToken } = useAuth();
  const [song, setSong] = useState<SongDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Edit states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingArtist, setIsEditingArtist] = useState(false);
  const [isEditingAlbum, setIsEditingAlbum] = useState(false);
  const [isEditingOffset, setIsEditingOffset] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editAlbum, setEditAlbum] = useState("");
  const [editOffset, setEditOffset] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchSong = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        getApiUrl(`/api/song/${encodeURIComponent(youtubeId)}?include=metadata,lyrics,translations,furigana`),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSong(data);
      } else if (response.status === 404) {
        setSong(null);
      }
    } catch (error) {
      console.error("Failed to fetch song:", error);
      toast.error(t("apps.admin.errors.failedToFetchSong", "Failed to fetch song"));
    } finally {
      setIsLoading(false);
    }
  }, [youtubeId, t]);

  useEffect(() => {
    fetchSong();
  }, [fetchSong]);

  const handleDelete = async () => {
    if (!username || !authToken) return;

    try {
      const success = await deleteSongMetadata(youtubeId, { username, authToken });

      if (success) {
        toast.success(t("apps.admin.messages.songDeleted", "Song deleted"));
        onSongDeleted();
        onBack();
      } else {
        toast.error(t("apps.admin.errors.failedToDeleteSong", "Failed to delete song"));
      }
    } catch (error) {
      console.error("Failed to delete song:", error);
      toast.error(t("apps.admin.errors.failedToDeleteSong", "Failed to delete song"));
    }
    setIsDeleteDialogOpen(false);
  };

  const saveField = async (field: "title" | "artist" | "album" | "lyricOffset", value: string) => {
    if (!song || !username || !authToken) return;

    setIsSaving(true);
    try {
      const updatedMetadata = {
        youtubeId: song.id,
        title: field === "title" ? value : song.title,
        artist: field === "artist" ? value : song.artist,
        album: field === "album" ? value : song.album,
        lyricOffset: field === "lyricOffset" ? parseInt(value, 10) || 0 : song.lyricOffset,
        lyricsSource: song.lyricsSource,
      };

      const success = await saveSongMetadata(updatedMetadata, { username, authToken });

      if (success) {
        toast.success(t("apps.admin.messages.songUpdated", "Song updated"));
        fetchSong();
      } else {
        toast.error(t("apps.admin.errors.failedToUpdateSong", "Failed to update song"));
      }
    } catch (error) {
      console.error("Failed to update song:", error);
      toast.error(t("apps.admin.errors.failedToUpdateSong", "Failed to update song"));
    } finally {
      setIsSaving(false);
      setIsEditingTitle(false);
      setIsEditingArtist(false);
      setIsEditingAlbum(false);
      setIsEditingOffset(false);
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t("apps.admin.time.now");
    if (minutes < 60) return t("apps.admin.time.minutesAgo", { count: minutes });
    if (hours < 24) return t("apps.admin.time.hoursAgo", { count: hours });
    return t("apps.admin.time.daysAgo", { count: days });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatOffset = (ms: number | undefined) => {
    if (ms === undefined) return "0ms";
    const sign = ms >= 0 ? "+" : "";
    return `${sign}${ms}ms (${(ms / 1000).toFixed(2)}s)`;
  };

  // Skeleton placeholder component
  const Skeleton = ({ className }: { className?: string }) => (
    <div className={cn("bg-neutral-200 animate-pulse rounded", className)} />
  );

  if (!isLoading && !song) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <AlertTriangle className="h-8 w-8 text-neutral-400" />
        <span className="text-[11px] text-neutral-500">
          {t("apps.admin.song.notFound", "Song not found")}
        </span>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-[11px]">
          <ArrowLeft className="h-3 w-3 mr-1" />
          {t("apps.admin.profile.back", "Back")}
        </Button>
      </div>
    );
  }

  const translationLanguages = song?.translations ? Object.keys(song.translations) : [];
  const lyricsLineCount = song?.lyrics?.parsedLines?.length || 0;
  const hasLyrics = !!song?.lyrics?.lrc || !!song?.lyrics?.krc;
  const hasFurigana = !!song?.furigana && song.furigana.length > 0;

  return (
    <div className="flex flex-col h-full font-geneva-12">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-6 w-6 p-0"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(
              "w-8 h-8 rounded flex items-center justify-center text-sm font-medium text-neutral-600 flex-shrink-0",
              isLoading ? "bg-neutral-200 animate-pulse" : "bg-neutral-200"
            )}
          >
            {!isLoading && <Music className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {isLoading ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <span className="text-[12px] font-medium truncate">{song?.title}</span>
              )}
            </div>
            {isLoading ? (
              <Skeleton className="h-3 w-24 mt-1" />
            ) : (
              <span className="text-[10px] text-neutral-500">
                {song?.artist || t("apps.admin.song.unknownArtist", "Unknown Artist")}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchSong}
          disabled={isLoading}
          className="h-6 w-6 p-0 flex-shrink-0"
        >
          {isLoading ? (
            <ActivityIndicator size={14} />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 mb-1">
                <FileText className="h-3 w-3" />
                {t("apps.admin.song.lyrics", "Lyrics")}
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-12" />
              ) : (
                <span className="text-[14px] font-medium">
                  {hasLyrics ? `${lyricsLineCount} lines` : "None"}
                </span>
              )}
            </div>
            <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 mb-1">
                <Languages className="h-3 w-3" />
                {t("apps.admin.song.translations", "Translations")}
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-[14px] font-medium">{translationLanguages.length}</span>
              )}
            </div>
            <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 mb-1">
                <Type className="h-3 w-3" />
                {t("apps.admin.song.furigana", "Furigana")}
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-[14px] font-medium">
                  {hasFurigana ? "Yes" : "No"}
                </span>
              )}
            </div>
          </div>

          {/* Metadata Section */}
          <div className="space-y-2">
            <div className="!text-[11px] uppercase tracking-wide text-black/50">
              {t("apps.admin.song.metadata", "Metadata")}
            </div>
            <div className="space-y-2">
              {/* Title */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
                <Music className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.tableHeaders.title", "Title")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-48 mt-1" />
                  ) : isEditingTitle ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="h-6 text-[11px] flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => saveField("title", editTitle)}
                        disabled={isSaving}
                        className="h-6 px-2 text-[10px]"
                      >
                        {isSaving ? <ActivityIndicator size={12} /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingTitle(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                      onClick={() => {
                        setEditTitle(song?.title || "");
                        setIsEditingTitle(true);
                      }}
                    >
                      {song?.title}
                    </div>
                  )}
                </div>
              </div>

              {/* Artist */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
                <User className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.tableHeaders.artist", "Artist")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : isEditingArtist ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editArtist}
                        onChange={(e) => setEditArtist(e.target.value)}
                        className="h-6 text-[11px] flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => saveField("artist", editArtist)}
                        disabled={isSaving}
                        className="h-6 px-2 text-[10px]"
                      >
                        {isSaving ? <ActivityIndicator size={12} /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingArtist(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                      onClick={() => {
                        setEditArtist(song?.artist || "");
                        setIsEditingArtist(true);
                      }}
                    >
                      {song?.artist || <span className="text-neutral-400">-</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Album */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
                <Disc className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.album", "Album")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : isEditingAlbum ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editAlbum}
                        onChange={(e) => setEditAlbum(e.target.value)}
                        className="h-6 text-[11px] flex-1"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        onClick={() => saveField("album", editAlbum)}
                        disabled={isSaving}
                        className="h-6 px-2 text-[10px]"
                      >
                        {isSaving ? <ActivityIndicator size={12} /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingAlbum(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                      onClick={() => {
                        setEditAlbum(song?.album || "");
                        setIsEditingAlbum(true);
                      }}
                    >
                      {song?.album || <span className="text-neutral-400">-</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Lyric Offset */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
                <Clock className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.lyricsOffset", "Lyrics Offset")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-24 mt-1" />
                  ) : isEditingOffset ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="number"
                        value={editOffset}
                        onChange={(e) => setEditOffset(e.target.value)}
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
                        {isSaving ? <ActivityIndicator size={12} /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingOffset(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="text-[11px] cursor-pointer hover:text-blue-600 mt-0.5"
                      onClick={() => {
                        setEditOffset(String(song?.lyricOffset || 0));
                        setIsEditingOffset(true);
                      }}
                    >
                      {formatOffset(song?.lyricOffset)}
                    </div>
                  )}
                </div>
              </div>

              {/* YouTube ID */}
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
                <Hash className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.youtubeId", "YouTube ID")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-28 mt-1" />
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[11px] font-mono">{song?.id}</span>
                      <a
                        href={`https://www.youtube.com/watch?v=${song?.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={`/ipod/${song?.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-500 hover:text-green-600"
                        title="Open in iPod"
                      >
                        <Play className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Lyrics Source Section */}
          {!isLoading && song?.lyricsSource && (
            <div className="space-y-2">
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.song.lyricsSource", "Lyrics Source")}
              </div>
              <div className="p-3 bg-blue-50 rounded border border-blue-200 text-[11px] space-y-1">
                <div>
                  <span className="text-neutral-500">{t("apps.admin.tableHeaders.title", "Title")}:</span>{" "}
                  {song.lyricsSource.title}
                </div>
                <div>
                  <span className="text-neutral-500">{t("apps.admin.tableHeaders.artist", "Artist")}:</span>{" "}
                  {song.lyricsSource.artist}
                </div>
                {song.lyricsSource.album && (
                  <div>
                    <span className="text-neutral-500">{t("apps.admin.song.album", "Album")}:</span>{" "}
                    {song.lyricsSource.album}
                  </div>
                )}
                <div>
                  <span className="text-neutral-500">Hash:</span>{" "}
                  <span className="font-mono text-[10px]">{song.lyricsSource.hash}</span>
                </div>
              </div>
            </div>
          )}

          {/* Translations Section */}
          {!isLoading && translationLanguages.length > 0 && (
            <div className="space-y-2">
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.song.availableTranslations", "Available Translations")}
              </div>
              <div className="flex flex-wrap gap-1">
                {translationLanguages.map((lang) => (
                  <span
                    key={lang}
                    className="px-2 py-1 text-[10px] bg-gray-100 rounded uppercase"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps Section */}
          {!isLoading && song && (
            <div className="space-y-2">
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.song.timestamps", "Timestamps")}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
                  <div className="text-[10px] text-neutral-500 mb-0.5">
                    {t("apps.admin.song.createdAt", "Created")}
                  </div>
                  <div>{formatDate(song.createdAt)}</div>
                  <div className="text-[10px] text-neutral-400">
                    ({formatRelativeTime(song.createdAt)})
                  </div>
                </div>
                <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
                  <div className="text-[10px] text-neutral-500 mb-0.5">
                    {t("apps.admin.song.updatedAt", "Updated")}
                  </div>
                  <div>{formatDate(song.updatedAt)}</div>
                  <div className="text-[10px] text-neutral-400">
                    ({formatRelativeTime(song.updatedAt)})
                  </div>
                </div>
              </div>
              {song.createdBy && (
                <div className="px-3 py-2 bg-gray-50 rounded border border-gray-200">
                  <div className="text-[10px] text-neutral-500 mb-0.5">
                    {t("apps.admin.tableHeaders.addedBy", "Added By")}
                  </div>
                  <div className="text-[11px]">{song.createdBy}</div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <div className="!text-[11px] uppercase tracking-wide text-black/50">
              {t("apps.admin.profile.actions", "Actions")}
            </div>
            {isLoading ? (
              <div className="flex gap-2">
                <Skeleton className="h-7 w-24" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="aqua-button secondary h-7 px-3 text-[11px] flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>{t("apps.admin.song.delete", "Delete Song")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        title={t("apps.admin.dialogs.deleteTitle", { type: "song" })}
        description={t("apps.admin.dialogs.deleteDescription", {
          type: "song",
          name: song?.title || youtubeId,
        })}
      />
    </div>
  );
};
