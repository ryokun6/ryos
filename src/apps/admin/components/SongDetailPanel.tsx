import React, { useState, useEffect, useCallback, useReducer } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ArrowLeft, Trash, MusicNote, Clock, User, VinylRecord, Hash, ArrowSquareOut, Warning, ArrowsClockwise, Microphone, UserMinus, Translate, FileText, TextT, Ear, Check, X, ArrowCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  adminAquaIconButtonClass,
  AQUA_ICON_BUTTON_ICON_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
} from "@/lib/aquaIconButton";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { LyricsSearchDialog, LyricsSearchResult } from "@/components/dialogs/LyricsSearchDialog";
import { deleteSongMetadata, saveSongMetadata, CachedLyricsSource } from "@/utils/songMetadataCache";
import { getApiUrl } from "@/utils/platform";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { abortableFetch } from "@/utils/abortableFetch";

interface FuriganaSegment {
  text: string;
  reading?: string;
}

interface SongDetail {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string; // Cover image URL (now in metadata, not lyrics)
  lyricOffset?: number;
  lyricsSource?: CachedLyricsSource;
  lyrics?: {
    lrc?: string;
    krc?: string;
    parsedLines?: Array<{ words: string; startTimeMs: string }>;
  };
  translations?: Record<string, string>;
  furigana?: FuriganaSegment[][];
  soramimi?: FuriganaSegment[][];
  soramimiByLang?: Record<string, FuriganaSegment[][]>;
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Replace {size} placeholder in Kugou image URL with actual size
 * Kugou image URLs contain {size} that needs to be replaced with: 100, 150, 240, 400, etc.
 * Also ensures HTTPS is used to avoid mixed content issues
 */
function formatKugouImageUrl(imgUrl: string | undefined, size: number = 400): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  // Ensure HTTPS
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

interface SongDetailPanelProps {
  youtubeId: string;
  onBack: () => void;
  onSongDeleted: () => void;
}

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("bg-neutral-200 animate-pulse rounded", className)} />
);

export const SongDetailPanel: React.FC<SongDetailPanelProps> = ({
  youtubeId,
  onBack,
  onSongDeleted,
}) => {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const launchApp = useLaunchApp();
  type SongEditState = {
    isEditingTitle: boolean;
    isEditingArtist: boolean;
    isEditingAlbum: boolean;
    isEditingOffset: boolean;
    editTitle: string;
    editArtist: string;
    editAlbum: string;
    editOffset: string;
    isSaving: boolean;
  };
  type SongEditAction =
    | { type: "startEdit"; field: "title" | "artist" | "album" | "offset"; value: string }
    | {
        type: "setValue";
        field: "editTitle" | "editArtist" | "editAlbum" | "editOffset";
        value: string;
      }
    | { type: "stopEditing"; field?: "title" | "artist" | "album" | "offset" }
    | { type: "setSaving"; isSaving: boolean };
  const initialEditState: SongEditState = {
    isEditingTitle: false,
    isEditingArtist: false,
    isEditingAlbum: false,
    isEditingOffset: false,
    editTitle: "",
    editArtist: "",
    editAlbum: "",
    editOffset: "",
    isSaving: false,
  };
  const editReducer = (
    state: SongEditState,
    action: SongEditAction
  ): SongEditState => {
    switch (action.type) {
      case "startEdit":
        return {
          ...state,
          isEditingTitle: action.field === "title",
          isEditingArtist: action.field === "artist",
          isEditingAlbum: action.field === "album",
          isEditingOffset: action.field === "offset",
          editTitle: action.field === "title" ? action.value : state.editTitle,
          editArtist:
            action.field === "artist" ? action.value : state.editArtist,
          editAlbum: action.field === "album" ? action.value : state.editAlbum,
          editOffset:
            action.field === "offset" ? action.value : state.editOffset,
        };
      case "setValue":
        return { ...state, [action.field]: action.value };
      case "stopEditing":
        if (!action.field) {
          return {
            ...state,
            isEditingTitle: false,
            isEditingArtist: false,
            isEditingAlbum: false,
            isEditingOffset: false,
          };
        }
        if (action.field === "title") return { ...state, isEditingTitle: false };
        if (action.field === "artist") {
          return { ...state, isEditingArtist: false };
        }
        if (action.field === "album") return { ...state, isEditingAlbum: false };
        return { ...state, isEditingOffset: false };
      case "setSaving":
        return { ...state, isSaving: action.isSaving };
      default:
        return state;
    }
  };
  const [editState, dispatchEdit] = useReducer(editReducer, initialEditState);
  const {
    isEditingTitle,
    isEditingArtist,
    isEditingAlbum,
    isEditingOffset,
    editTitle,
    editArtist,
    editAlbum,
    editOffset,
    isSaving,
  } = editState;
  const [song, setSong] = useState<SongDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [youtubeOembedTitle, setYoutubeOembedTitle] = useState<string | null>(null);
  const [isYoutubeOembedLoading, setIsYoutubeOembedLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUnshareDialogOpen, setIsUnshareDialogOpen] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);

  const fetchSong = useCallback(async () => {
    setIsLoading(true);
    try {
      // Include lyrics, translations, furigana, soramimi to get full song data
      const response = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}?include=metadata,lyrics,translations,furigana,soramimi`),
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 20000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
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

  // Force refresh lyrics from Kugou
  const handleForceRefresh = useCallback(async () => {
    if (!username || !isAuthenticated || !song?.lyricsSource) {
      toast.error(t("apps.admin.errors.cannotForceRefresh", "Cannot force refresh - no lyrics source or not authenticated"));
      return;
    }

    setIsForceRefreshing(true);
    try {
      const response = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "fetch-lyrics",
            force: true,
            lyricsSource: song.lyricsSource,
          }),
          timeout: 20000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );

      if (response.ok) {
        toast.success(t("apps.admin.messages.lyricsRefreshed", "Lyrics refreshed from source"));
        // Re-fetch song to get updated data
        await fetchSong();
      } else {
        const data = await response.json();
        toast.error(data.error || t("apps.admin.errors.failedToRefreshLyrics", "Failed to refresh lyrics"));
      }
    } catch (error) {
      console.error("Failed to force refresh lyrics:", error);
      toast.error(t("apps.admin.errors.failedToRefreshLyrics", "Failed to refresh lyrics"));
    } finally {
      setIsForceRefreshing(false);
    }
  }, [youtubeId, username, isAuthenticated, song?.lyricsSource, fetchSong, t]);

  // Handle lyrics search selection - fetch new lyrics with selected source and update metadata
  const handleLyricsSearchSelect = useCallback(async (result: LyricsSearchResult) => {
    if (!username || !isAuthenticated) {
      toast.error(t("apps.admin.errors.notAuthenticated", "Not authenticated"));
      return;
    }

    setIsForceRefreshing(true);
    try {
      // First, fetch lyrics with the new source
      const lyricsResponse = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "fetch-lyrics",
            force: true,
            lyricsSource: {
              hash: result.hash,
              albumId: result.albumId,
              title: result.title,
              artist: result.artist,
              album: result.album,
            },
          }),
          timeout: 20000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );

      if (!lyricsResponse.ok) {
        const data = await lyricsResponse.json();
        toast.error(data.error || t("apps.admin.errors.failedToUpdateLyrics", "Failed to update lyrics"));
        return;
      }

      // Then, update song metadata with title/artist/album from the search result
      const metadataResponse = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: result.title,
            artist: result.artist,
            album: result.album,
          }),
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );

      if (metadataResponse.ok) {
        toast.success(t("apps.admin.messages.lyricsAndMetadataUpdated", "Lyrics and metadata updated"));
      } else {
        // Lyrics updated but metadata failed - still show partial success
        toast.success(t("apps.admin.messages.lyricsUpdated", "Lyrics updated"));
        toast.warning(t("apps.admin.errors.failedToUpdateMetadata", "Failed to update metadata"));
      }

      // Re-fetch song to get updated data
      await fetchSong();
    } catch (error) {
      console.error("Failed to update lyrics source:", error);
      toast.error(t("apps.admin.errors.failedToUpdateLyrics", "Failed to update lyrics"));
    } finally {
      setIsForceRefreshing(false);
    }
  }, [youtubeId, username, isAuthenticated, fetchSong, t]);

  // Handle lyrics search reset - clear lyrics source
  const handleLyricsSearchReset = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    try {
      const response = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clearLyrics: true,
          }),
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );

      if (response.ok) {
        toast.success(t("apps.admin.messages.lyricsReset", "Lyrics reset"));
        await fetchSong();
      } else {
        toast.error(t("apps.admin.errors.failedToResetLyrics", "Failed to reset lyrics"));
      }
    } catch (error) {
      console.error("Failed to reset lyrics:", error);
    }
  }, [youtubeId, username, isAuthenticated, fetchSong, t]);

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

  useEffect(() => {
    let isCancelled = false;
    const fetchOembedTitle = async () => {
      setIsYoutubeOembedLoading(true);
      try {
        const url = `https://www.youtube.com/watch?v=${youtubeId}`;
        const response = await abortableFetch(
          getApiUrl(`/api/link-preview?url=${encodeURIComponent(url)}`),
          {
            headers: { "Content-Type": "application/json" },
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        if (!response.ok) return;
        const data = (await response.json()) as { title?: string };
        const title = data.title?.trim();
        if (!isCancelled) setYoutubeOembedTitle(title && title.length > 0 ? title : null);
      } catch {
        if (!isCancelled) setYoutubeOembedTitle(null);
      } finally {
        if (!isCancelled) setIsYoutubeOembedLoading(false);
      }
    };
    fetchOembedTitle();
    return () => {
      isCancelled = true;
    };
  }, [youtubeId]);

  const handleDelete = async () => {
    if (!username || !isAuthenticated) return;

    try {
      const success = await deleteSongMetadata(youtubeId, { username, isAuthenticated });

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
    if (!username || !isAuthenticated) return;

    setIsUnsharing(true);
    try {
      const response = await abortableFetch(
        getApiUrl(`/api/songs/${encodeURIComponent(youtubeId)}`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "unshare" }),
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
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
    if (!song || !username || !isAuthenticated) return;

    dispatchEdit({ type: "setSaving", isSaving: true });
    try {
      const updatedMetadata = {
        youtubeId: song.id,
        title: field === "title" ? value : song.title,
        artist: field === "artist" ? value : song.artist,
        album: field === "album" ? value : song.album,
        lyricOffset: field === "lyricOffset" ? parseInt(value, 10) || 0 : song.lyricOffset,
        lyricsSource: song.lyricsSource,
      };

      const success = await saveSongMetadata(updatedMetadata, { username, isAuthenticated });

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
      dispatchEdit({ type: "setSaving", isSaving: false });
      dispatchEdit({ type: "stopEditing" });
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

  if (!isLoading && !song) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Warning className="size-8 text-neutral-400" weight="bold" />
        <span className="text-[11px] text-neutral-500">
          {t("apps.admin.song.notFound", "Song not found")}
        </span>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-[11px]">
          <ArrowLeft className="size-3 mr-1" weight="bold" />
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
          className="size-6 p-0"
        >
          <ArrowLeft className="size-3.5" weight="bold" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className={cn(
              "size-10 rounded flex items-center justify-center text-sm font-medium text-neutral-600 flex-shrink-0 overflow-hidden",
              isLoading ? "bg-neutral-200 animate-pulse" : "bg-neutral-200"
            )}
          >
            {!isLoading && (
              <img
                src={formatKugouImageUrl(song?.cover, 150) || `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`}
                alt=""
                className="size-full object-cover"
                onError={(e) => {
                  // Fall back to YouTube thumbnail if Kugou cover fails
                  // Use proper URL parsing to check hostname (not substring match which could be bypassed)
                  const target = e.target as HTMLImageElement;
                  try {
                    const url = new URL(target.src);
                    const isYouTube = url.hostname === "img.youtube.com" || url.hostname === "i.ytimg.com";
                    if (!isYouTube) {
                      target.src = `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`;
                    }
                  } catch {
                    // Invalid URL, set fallback
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
                  title={t("apps.admin.song.forceRefreshTooltip", "Re-fetch lyrics from Kugou and clear cached annotations")}
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
          )}

          {/* Metadata Section */}
          <div className="space-y-2">
            <div className="!text-[11px] uppercase tracking-wide text-black/50">
              {t("apps.admin.song.metadata", "Metadata")}
            </div>
            <div className="space-y-2">
              {/* Title */}
              <div className="flex items-start gap-2 py-1.5">
                <MusicNote className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.tableHeaders.title", "Title")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-48 mt-1" />
                  ) : isEditingTitle ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editTitle}
                        onChange={(e) =>
                          dispatchEdit({
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          dispatchEdit({ type: "stopEditing", field: "title" })
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
                        dispatchEdit({
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

              {/* Artist */}
              <div className="flex items-start gap-2 py-1.5">
                <User className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.tableHeaders.artist", "Artist")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : isEditingArtist ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editArtist}
                        onChange={(e) =>
                          dispatchEdit({
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          dispatchEdit({ type: "stopEditing", field: "artist" })
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
                        dispatchEdit({
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

              {/* Album */}
              <div className="flex items-start gap-2 py-1.5">
                <VinylRecord className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.album", "Album")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : isEditingAlbum ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={editAlbum}
                        onChange={(e) =>
                          dispatchEdit({
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          dispatchEdit({ type: "stopEditing", field: "album" })
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
                        dispatchEdit({
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

              {/* Lyric Offset */}
              <div className="flex items-start gap-2 py-1.5">
                <Clock className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.lyricsOffset", "Lyrics Offset")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-24 mt-1" />
                  ) : isEditingOffset ? (
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="number"
                        value={editOffset}
                        onChange={(e) =>
                          dispatchEdit({
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
                        {isSaving ? <ActivityIndicator size={12} /> : t("common.dialog.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          dispatchEdit({ type: "stopEditing", field: "offset" })
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
                        dispatchEdit({
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

              {/* YouTube ID */}
              <div className="flex items-start gap-2 py-1.5">
                <Hash className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.youtubeId", "YouTube ID")}</div>
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
                        <div className="text-[11px] mt-0.5 truncate" title={youtubeOembedTitle}>
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

          {/* Lyrics Content Section */}
          <div className="space-y-2">
            <div className="!text-[11px] uppercase tracking-wide text-black/50">
              {t("apps.admin.song.lyricsContent", "Lyrics Content")}
            </div>
            <div className="space-y-2">
              {/* Lyrics Source */}
              <div className="flex items-start gap-2 py-1.5">
                <FileText className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.lyricsSource", "Lyrics")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      {song?.lyrics?.lrc ? (
                        <>
                          <Check className="size-3 text-green-500" weight="bold" />
                          <span className="text-[11px] text-green-600">
                            {song.lyrics.parsedLines?.length || 0} {t("apps.admin.song.lines", "lines")}
                            {song.lyrics.krc && (
                              <span className="text-neutral-400 ml-1">
                                ({t("apps.admin.song.withWordTiming", "with word timing")})
                              </span>
                            )}
                          </span>
                        </>
                      ) : (
                        <>
                          <X className="size-3 text-neutral-400" weight="bold" />
                          <span className="text-[11px] text-neutral-400">
                            {t("apps.admin.song.notAvailable", "Not available")}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  {!isLoading && song?.lyricsSource && (
                    <div className="text-[10px] text-neutral-400 mt-1">
                      {t("apps.admin.song.source", "Source")}: {song.lyricsSource.title} - {song.lyricsSource.artist}
                    </div>
                  )}
                </div>
              </div>

              {/* Furigana */}
              <div className="flex items-start gap-2 py-1.5">
                <TextT className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.furigana", "Furigana")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-24 mt-1" />
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      {song?.furigana && song.furigana.length > 0 ? (
                        <>
                          <Check className="size-3 text-green-500" weight="bold" />
                          <span className="text-[11px] text-green-600">
                            {song.furigana.length} {t("apps.admin.song.lines", "lines")}
                          </span>
                        </>
                      ) : (
                        <>
                          <X className="size-3 text-neutral-400" weight="bold" />
                          <span className="text-[11px] text-neutral-400">
                            {t("apps.admin.song.notGenerated", "Not generated")}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Translations */}
              <div className="flex items-start gap-2 py-1.5">
                <Translate className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.translations", "Translations")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      {song?.translations && Object.keys(song.translations).length > 0 ? (
                        <>
                          <Check className="size-3 text-green-500" weight="bold" />
                          <span className="text-[11px] text-green-600">
                            {Object.keys(song.translations).map(lang => 
                              t(`apps.admin.languages.${lang}`, lang)
                            ).join(", ")}
                          </span>
                        </>
                      ) : (
                        <>
                          <X className="size-3 text-neutral-400" weight="bold" />
                          <span className="text-[11px] text-neutral-400">
                            {t("apps.admin.song.notGenerated", "Not generated")}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Soramimi */}
              <div className="flex items-start gap-2 py-1.5">
                <Ear className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5" weight="bold" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-neutral-500">{t("apps.admin.song.soramimi", "Soramimi (空耳)")}</div>
                  {isLoading ? (
                    <Skeleton className="h-4 w-32 mt-1" />
                  ) : (
                    <div className="flex items-center gap-1 mt-0.5">
                      {(() => {
                        const hasSoramimi = song?.soramimi && song.soramimi.length > 0;
                        const soramimiByLang = song?.soramimiByLang;
                        const hasSoramimiByLang = soramimiByLang && Object.keys(soramimiByLang).length > 0;
                        
                        if (hasSoramimi || hasSoramimiByLang) {
                          const languages: string[] = [];
                          if (hasSoramimi) languages.push("zh-TW");
                          if (hasSoramimiByLang) {
                            Object.keys(soramimiByLang).forEach(lang => {
                              if (!languages.includes(lang)) languages.push(lang);
                            });
                          }
                          return (
                            <>
                              <Check className="size-3 text-green-500" weight="bold" />
                              <span className="text-[11px] text-green-600">
                                {languages.map(l => t(`apps.admin.languages.${l}`, l)).join(", ")}
                              </span>
                            </>
                          );
                        }
                        return (
                          <>
                            <X className="size-3 text-neutral-400" weight="bold" />
                            <span className="text-[11px] text-neutral-400">
                              {t("apps.admin.song.notGenerated", "Not generated")}
                            </span>
                          </>
                        );
                      })()}
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
        title={t("apps.admin.dialogs.deleteTitle", { type: t("common.dialog.share.itemTypes.song") })}
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
          currentSelection={song.lyricsSource ? {
            title: song.lyricsSource.title,
            artist: song.lyricsSource.artist,
            album: song.lyricsSource.album,
            cover: song.cover,
          } : undefined}
        />
      )}
    </div>
  );
};
