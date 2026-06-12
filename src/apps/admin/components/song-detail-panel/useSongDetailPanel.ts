import { useState, useEffect, useCallback, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import type { LyricsSearchResult } from "@/components/dialogs/LyricsSearchDialog";
import {
  deleteSongMetadata,
  saveSongMetadata,
} from "@/utils/songMetadataCache";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  appleMusicIdKindLabel,
  generateAppleMusicWebUrlForId,
  isAppleMusicId,
  parseAppleMusicId,
} from "@/utils/appleMusicId";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import type { SongDetail, SongDetailPanelProps } from "./types";
import {
  initialEditState,
  songEditReducer,
  type SongEditAction,
} from "./song-edit-reducer";
import { formatAdminRelativeTime } from "../../utils/adminTime";

export function useSongDetailPanel({
  youtubeId,
  onBack,
  onSongDeleted,
}: SongDetailPanelProps) {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const launchApp = useLaunchApp();

  const isAppleMusic = isAppleMusicId(youtubeId);
  const appleMusicIdKind = parseAppleMusicId(youtubeId)?.kind ?? null;

  const [editState, dispatchEdit] = useReducer(songEditReducer, initialEditState);
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
  const [youtubeOembedTitle, setYoutubeOembedTitle] = useState<string | null>(
    null
  );
  const [isYoutubeOembedLoading, setIsYoutubeOembedLoading] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isUnshareDialogOpen, setIsUnshareDialogOpen] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] =
    useState(false);

  const fetchSong = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await abortableFetch(
        getApiUrl(
          `/api/songs/${encodeURIComponent(youtubeId)}?include=metadata,lyrics,translations,furigana,soramimi`
        ),
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
      toast.error(
        t("apps.admin.errors.failedToFetchSong", "Failed to fetch song")
      );
    } finally {
      setIsLoading(false);
    }
  }, [youtubeId, t]);

  const handleForceRefresh = useCallback(async () => {
    if (!username || !isAuthenticated || !song?.lyricsSource) {
      toast.error(
        t(
          "apps.admin.errors.cannotForceRefresh",
          "Cannot force refresh - no lyrics source or not authenticated"
        )
      );
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
        toast.success(
          t("apps.admin.messages.lyricsRefreshed", "Lyrics refreshed from source")
        );
        await fetchSong();
      } else {
        const data = await response.json();
        toast.error(
          data.error ||
            t(
              "apps.admin.errors.failedToRefreshLyrics",
              "Failed to refresh lyrics"
            )
        );
      }
    } catch (error) {
      console.error("Failed to force refresh lyrics:", error);
      toast.error(
        t(
          "apps.admin.errors.failedToRefreshLyrics",
          "Failed to refresh lyrics"
        )
      );
    } finally {
      setIsForceRefreshing(false);
    }
  }, [youtubeId, username, isAuthenticated, song?.lyricsSource, fetchSong, t]);

  const handleLyricsSearchSelect = useCallback(
    async (result: LyricsSearchResult) => {
      if (!username || !isAuthenticated) {
        toast.error(
          t("apps.admin.errors.notAuthenticated", "Not authenticated")
        );
        return;
      }

      setIsForceRefreshing(true);
      try {
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
          toast.error(
            data.error ||
              t(
                "apps.admin.errors.failedToUpdateLyrics",
                "Failed to update lyrics"
              )
          );
          return;
        }

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
          toast.success(
            t(
              "apps.admin.messages.lyricsAndMetadataUpdated",
              "Lyrics and metadata updated"
            )
          );
        } else {
          toast.success(
            t("apps.admin.messages.lyricsUpdated", "Lyrics updated")
          );
          toast.warning(
            t(
              "apps.admin.errors.failedToUpdateMetadata",
              "Failed to update metadata"
            )
          );
        }

        await fetchSong();
      } catch (error) {
        console.error("Failed to update lyrics source:", error);
        toast.error(
          t(
            "apps.admin.errors.failedToUpdateLyrics",
            "Failed to update lyrics"
          )
        );
      } finally {
        setIsForceRefreshing(false);
      }
    },
    [youtubeId, username, isAuthenticated, fetchSong, t]
  );

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
        toast.error(
          t("apps.admin.errors.failedToResetLyrics", "Failed to reset lyrics")
        );
      }
    } catch (error) {
      console.error("Failed to reset lyrics:", error);
    }
  }, [youtubeId, username, isAuthenticated, fetchSong, t]);

  const handlePlayInIpod = useCallback(async () => {
    const appState = useAppStore.getState();
    const ipodInstances = appState.getInstancesByAppId("ipod");
    const hasOpenIpodInstance = ipodInstances.some((inst) => inst.isOpen);
    if (!hasOpenIpodInstance) {
      launchApp("ipod");
    }

    const ipodStore = useIpodStore.getState();
    const trackExists = ipodStore.tracks.some((tr) => tr.id === youtubeId);

    if (trackExists) {
      ipodStore.setCurrentSongId(youtubeId);
      ipodStore.setIsPlaying(true);
      toast.success(t("apps.admin.messages.playingInIpod", "Playing in iPod"));
    } else {
      toast.info(
        t("apps.admin.messages.addingToLibrary", "Adding to library...")
      );
      const track = await ipodStore.addTrackFromVideoId(youtubeId, true);
      if (track) {
        toast.success(t("apps.admin.messages.playingInIpod", "Playing in iPod"));
      } else {
        toast.error(
          t(
            "apps.admin.errors.failedToAddToLibrary",
            "Failed to add to library"
          )
        );
      }
    }
  }, [youtubeId, launchApp, t]);

  const handlePlayInKaraoke = useCallback(async () => {
    const appState = useAppStore.getState();
    const karaokeInstances = appState.getInstancesByAppId("karaoke");
    const hasOpenKaraokeInstance = karaokeInstances.some((inst) => inst.isOpen);
    if (!hasOpenKaraokeInstance) {
      launchApp("karaoke");
    }

    const ipodStore = useIpodStore.getState();
    const karaokeStore = useKaraokeStore.getState();
    const trackExists = ipodStore.tracks.some((tr) => tr.id === youtubeId);

    if (!trackExists) {
      toast.info(
        t("apps.admin.messages.addingToLibrary", "Adding to library...")
      );
      const track = await ipodStore.addTrackFromVideoId(youtubeId, false);
      if (!track) {
        toast.error(
          t(
            "apps.admin.errors.failedToAddToLibrary",
            "Failed to add to library"
          )
        );
        return;
      }
    }

    karaokeStore.setCurrentSongId(youtubeId);
    karaokeStore.setIsPlaying(true);
    toast.success(
      t("apps.admin.messages.playingInKaraoke", "Playing in Karaoke")
    );
  }, [youtubeId, launchApp, t]);

  const appleMusicWebUrl = isAppleMusic
    ? generateAppleMusicWebUrlForId({
        id: youtubeId,
        title: song?.title,
        artist: song?.artist,
        storefrontId: useIpodStore.getState().appleMusicStorefrontId,
      })
    : null;

  const appleMusicKindLabel = appleMusicIdKind
    ? appleMusicIdKindLabel(appleMusicIdKind)
    : null;

  const handleOpenInAppleMusic = useCallback(() => {
    if (!appleMusicWebUrl) return;
    window.open(appleMusicWebUrl, "_blank", "noopener,noreferrer");
  }, [appleMusicWebUrl]);

  useEffect(() => {
    fetchSong();
  }, [fetchSong]);

  useEffect(() => {
    if (isAppleMusic) {
      setYoutubeOembedTitle(null);
      setIsYoutubeOembedLoading(false);
      return;
    }
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
        if (!isCancelled)
          setYoutubeOembedTitle(title && title.length > 0 ? title : null);
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
  }, [youtubeId, isAppleMusic]);

  const handleDelete = async () => {
    if (!username || !isAuthenticated) return;

    try {
      const success = await deleteSongMetadata(youtubeId, {
        username,
        isAuthenticated,
      });

      if (success) {
        toast.success(t("apps.admin.messages.songDeleted", "Song deleted"));
        onSongDeleted();
        onBack();
      } else {
        toast.error(
          t("apps.admin.errors.failedToDeleteSong", "Failed to delete song")
        );
      }
    } catch (error) {
      console.error("Failed to delete song:", error);
      toast.error(
        t("apps.admin.errors.failedToDeleteSong", "Failed to delete song")
      );
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
        toast.error(
          data.error ||
            t("apps.admin.errors.failedToUnshareSong", "Failed to unshare song")
        );
      }
    } catch (error) {
      console.error("Failed to unshare song:", error);
      toast.error(
        t("apps.admin.errors.failedToUnshareSong", "Failed to unshare song")
      );
    } finally {
      setIsUnsharing(false);
      setIsUnshareDialogOpen(false);
    }
  };

  const saveField = async (
    field: "title" | "artist" | "album" | "lyricOffset",
    value: string
  ) => {
    if (!song || !username || !isAuthenticated) return;

    dispatchEdit({ type: "setSaving", isSaving: true });
    try {
      const updatedMetadata = {
        youtubeId: song.id,
        title: field === "title" ? value : song.title,
        artist: field === "artist" ? value : song.artist,
        album: field === "album" ? value : song.album,
        lyricOffset:
          field === "lyricOffset" ? parseInt(value, 10) || 0 : song.lyricOffset,
        lyricsSource: song.lyricsSource,
      };

      const success = await saveSongMetadata(updatedMetadata, {
        username,
        isAuthenticated,
      });

      if (success) {
        toast.success(t("apps.admin.messages.songUpdated", "Song updated"));
        fetchSong();
      } else {
        toast.error(
          t("apps.admin.errors.failedToUpdateSong", "Failed to update song")
        );
      }
    } catch (error) {
      console.error("Failed to update song:", error);
      toast.error(
        t("apps.admin.errors.failedToUpdateSong", "Failed to update song")
      );
    } finally {
      dispatchEdit({ type: "setSaving", isSaving: false });
      dispatchEdit({ type: "stopEditing" });
    }
  };

  const formatRelativeTime = (timestamp: number) =>
    formatAdminRelativeTime(timestamp, t);

  const dispatchSongEdit = (action: SongEditAction) => dispatchEdit(action);

  return {
    t,
    youtubeId,
    onBack,
    song,
    isLoading,
    isAppleMusic,
    appleMusicKindLabel,
    appleMusicWebUrl,
    handleOpenInAppleMusic,
    youtubeOembedTitle,
    isYoutubeOembedLoading,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isUnshareDialogOpen,
    setIsUnshareDialogOpen,
    isUnsharing,
    isForceRefreshing,
    isLyricsSearchDialogOpen,
    setIsLyricsSearchDialogOpen,
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
    fetchSong,
    handleForceRefresh,
    handleLyricsSearchSelect,
    handleLyricsSearchReset,
    handlePlayInIpod,
    handlePlayInKaraoke,
    handleDelete,
    handleUnshare,
    saveField,
    formatRelativeTime,
  };
}

export type SongDetailPanelViewModel = ReturnType<typeof useSongDetailPanel>;
