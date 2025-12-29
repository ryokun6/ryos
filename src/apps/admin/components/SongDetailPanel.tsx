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
  AlertTriangle,
  RefreshCw,
  Mic,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { deleteSongMetadata, saveSongMetadata, CachedLyricsSource } from "@/utils/songMetadataCache";
import { getApiUrl } from "@/utils/platform";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";

interface SongDetail {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  lyrics?: {
    cover?: string;
  };
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Replace {size} placeholder in Kugou image URL with actual size
 * Kugou image URLs contain {size} that needs to be replaced with: 100, 150, 240, 400, etc.
 */
function formatKugouImageUrl(imgUrl: string | undefined, size: number = 400): string | null {
  if (!imgUrl) return null;
  return imgUrl.replace("{size}", String(size));
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
  const launchApp = useLaunchApp();
  const [song, setSong] = useState<SongDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUnshareDialogOpen, setIsUnshareDialogOpen] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);
  
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
      // Include lyrics to get cover image URL
      const response = await fetch(
        getApiUrl(`/api/song/${encodeURIComponent(youtubeId)}?include=metadata,lyrics`),
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

  // Play song in iPod
  const handlePlayInIpod = useCallback(async () => {
    // Ensure iPod is open
    const appState = useAppStore.getState();
    const ipodInstances = appState.getInstancesByAppId("ipod");
    const hasOpenIpodInstance = ipodInstances.some((inst) => inst.isOpen);
    if (!hasOpenIpodInstance) {
      launchApp("ipod");
    }

    const ipodStore = useIpodStore.getState();
    const trackExists = ipodStore.tracks.some((t) => t.id === youtubeId);

    if (trackExists) {
      // Song is in library, play it
      ipodStore.setCurrentSongId(youtubeId);
      ipodStore.setIsPlaying(true);
      toast.success(t("apps.admin.messages.playingInIpod", "Playing in iPod"));
    } else {
      // Song not in library, add it first
      toast.info(t("apps.admin.messages.addingToLibrary", "Adding to library..."));
      const track = await ipodStore.addTrackFromVideoId(youtubeId, true);
      if (track) {
        toast.success(t("apps.admin.messages.playingInIpod", "Playing in iPod"));
      } else {
        toast.error(t("apps.admin.errors.failedToAddToLibrary", "Failed to add to library"));
      }
    }
  }, [youtubeId, launchApp, t]);

  // Play song in Karaoke
  const handlePlayInKaraoke = useCallback(async () => {
    // Ensure Karaoke is open
    const appState = useAppStore.getState();
    const karaokeInstances = appState.getInstancesByAppId("karaoke");
    const hasOpenKaraokeInstance = karaokeInstances.some((inst) => inst.isOpen);
    if (!hasOpenKaraokeInstance) {
      launchApp("karaoke");
    }

    const ipodStore = useIpodStore.getState();
    const karaokeStore = useKaraokeStore.getState();
    const trackExists = ipodStore.tracks.some((t) => t.id === youtubeId);

    if (!trackExists) {
      // Song not in library, add it first
      toast.info(t("apps.admin.messages.addingToLibrary", "Adding to library..."));
      const track = await ipodStore.addTrackFromVideoId(youtubeId, false);
      if (!track) {
        toast.error(t("apps.admin.errors.failedToAddToLibrary", "Failed to add to library"));
        return;
      }
    }

    // Song is now in library, play it
    karaokeStore.setCurrentSongId(youtubeId);
    karaokeStore.setIsPlaying(true);
    toast.success(t("apps.admin.messages.playingInKaraoke", "Playing in Karaoke"));
  }, [youtubeId, launchApp, t]);

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

  const handleUnshare = async () => {
    if (!username || !authToken) return;

    setIsUnsharing(true);
    try {
      const response = await fetch(
        getApiUrl(`/api/song/${encodeURIComponent(youtubeId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
            "X-Username": username,
          },
          body: JSON.stringify({ action: "unshare" }),
        }
      );

      if (response.ok) {
        toast.success(t("apps.admin.messages.songUnshared", "Song unshared"));
        fetchSong();
      } else {
        const data = await response.json();
        toast.error(data.error || t("apps.admin.errors.failedToUnshareSong", "Failed to unshare song"));
      }
    } catch (error) {
      console.error("Failed to unshare song:", error);
      toast.error(t("apps.admin.errors.failedToUnshareSong", "Failed to unshare song"));
    } finally {
      setIsUnsharing(false);
      setIsUnshareDialogOpen(false);
    }
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
              "w-10 h-10 rounded flex items-center justify-center text-sm font-medium text-neutral-600 flex-shrink-0 overflow-hidden",
              isLoading ? "bg-neutral-200 animate-pulse" : "bg-neutral-200"
            )}
          >
            {!isLoading && (
              <img
                src={formatKugouImageUrl(song?.lyrics?.cover, 150) || `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Fall back to YouTube thumbnail if Kugou cover fails
                  const target = e.target as HTMLImageElement;
                  if (!target.src.includes("youtube.com")) {
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
          onClick={() => setIsDeleteDialogOpen(true)}
          disabled={isLoading}
          className="h-6 w-6 p-0 flex-shrink-0"
          title={t("apps.admin.song.delete", "Delete Song")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
          {/* Actions */}
          {isLoading ? (
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          ) : song && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handlePlayInIpod}
                className="aqua-button secondary h-7 px-3 text-[11px] flex items-center gap-1"
              >
                <Music className="h-3 w-3" />
                <span>{t("apps.admin.song.playInIpod", "Play in iPod")}</span>
              </button>
              <button
                onClick={handlePlayInKaraoke}
                className="aqua-button secondary h-7 px-3 text-[11px] flex items-center gap-1"
              >
                <Mic className="h-3 w-3" />
                <span>{t("apps.admin.song.playInKaraoke", "Play in Karaoke")}</span>
              </button>
              {song.createdBy && (
                <button
                  onClick={() => setIsUnshareDialogOpen(true)}
                  disabled={isUnsharing}
                  className="aqua-button secondary h-7 px-3 text-[11px] flex items-center gap-1"
                >
                  {isUnsharing ? (
                    <ActivityIndicator size={12} />
                  ) : (
                    <UserX className="h-3 w-3" />
                  )}
                  <span>{t("apps.admin.song.unshare", "Unshare")}</span>
                </button>
              )}
            </div>
          )}

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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingTitle(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {t("common.dialog.cancel")}
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingArtist(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {t("common.dialog.cancel")}
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingAlbum(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {t("common.dialog.cancel")}
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsEditingOffset(false)}
                        className="h-6 px-2 text-[10px]"
                      >
                        {t("common.dialog.cancel")}
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
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info Section */}
          {!isLoading && song && (
            <div className="space-y-2">
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.song.info", "Info")}
              </div>
              <div className="text-[11px] text-neutral-500 space-y-1">
                {song.createdBy && (
                  <div>
                    {t("apps.admin.tableHeaders.addedBy", "Added By")}: <span className="text-neutral-700">{song.createdBy}</span>
                  </div>
                )}
                <div>
                  {t("apps.admin.song.createdAt", "Created")}: <span className="text-neutral-700">{formatRelativeTime(song.createdAt)}</span>
                </div>
                <div>
                  {t("apps.admin.song.updatedAt", "Updated")}: <span className="text-neutral-700">{formatRelativeTime(song.updatedAt)}</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </ScrollArea>

      {/* Confirm Dialogs */}
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
    </div>
  );
};
