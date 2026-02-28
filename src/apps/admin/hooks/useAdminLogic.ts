import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useAuth } from "@/hooks/useAuth";
import { useOffline } from "@/hooks/useOffline";
import { useThemeStore } from "@/stores/useThemeStore";
import { toast } from "sonner";
import {
  bulkImportSongMetadata,
  deleteAllSongMetadata,
  deleteSongMetadata,
  listAllCachedSongMetadata,
  type BulkImportProgress,
  type CachedSongMetadata,
} from "@/utils/songMetadataCache";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { helpItems } from "..";

/**
 * Format Kugou image URL with size and HTTPS
 * Kugou URLs contain {size} placeholder that needs to be replaced
 */
function formatKugouImageUrl(
  imgUrl: string | undefined,
  size: number = 100
): string | null {
  if (!imgUrl) return null;
  let url = imgUrl.replace("{size}", String(size));
  url = url.replace(/^http:\/\//, "https://");
  return url;
}

interface User {
  username: string;
  lastActive: number;
  banned?: boolean;
}

interface Room {
  id: string;
  name: string;
  type: "public" | "private";
  createdAt: number;
  userCount: number;
  members?: string[];
}

interface Message {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
}

interface Stats {
  totalUsers: number;
  totalRooms: number;
  totalMessages: number;
  totalSongs?: number;
}

interface DeleteTarget {
  type: "user" | "room" | "message" | "song" | "allSongs";
  id: string;
  name: string;
}

type AdminSection = "users" | "rooms" | "songs";

const USERS_PER_PAGE = 100;
const SONGS_PER_PAGE = 100;
const EXPORT_FETCH_BATCH_SIZE = 50;
const EXPORT_TRANSFORM_BATCH_SIZE = 25;
const IMPORT_PREPARE_PROGRESS_STEP = 50;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

interface ExportSongDocument {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
  lyricOffset?: number;
  lyricsSource?: CachedSongMetadata["lyricsSource"];
  createdBy?: string;
  createdAt: number;
  updatedAt: number;
  importOrder?: number;
  lyrics?: { lrc?: string; krc?: string };
  translations?: Record<string, string>;
  furigana?: Array<Array<{ text: string; reading?: string }>>;
  soramimi?: Array<Array<{ text: string; reading?: string }>>;
  soramimiByLang?: Record<string, Array<Array<{ text: string; reading?: string }>>>;
}

type ImportStatusPhase =
  | "idle"
  | "reading-file"
  | "parsing-file"
  | "validating-data"
  | "preparing-songs"
  | "uploading-batches"
  | "waiting-rate-limit"
  | "refreshing-library"
  | "completed"
  | "failed";

interface ImportStatus {
  phase: ImportStatusPhase;
  fileName: string | null;
  fileSizeBytes: number;
  totalSongs: number;
  processedSongs: number;
  imported: number;
  updated: number;
  currentBatch: number;
  totalBatches: number;
  currentBatchSize: number;
  message: string | null;
  error: string | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const INITIAL_IMPORT_STATUS: ImportStatus = {
  phase: "idle",
  fileName: null,
  fileSizeBytes: 0,
  totalSongs: 0,
  processedSongs: 0,
  imported: 0,
  updated: 0,
  currentBatch: 0,
  totalBatches: 0,
  currentBatchSize: 0,
  message: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

export interface UseAdminLogicProps {
  isWindowOpen: boolean;
}

export function useAdminLogic({ isWindowOpen }: UseAdminLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("admin", helpItems);
  const { username, authToken } = useAuth();
  const isOffline = useOffline();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [visibleUsersCount, setVisibleUsersCount] = useState(USERS_PER_PAGE);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalRooms: 0,
    totalMessages: 0,
  });

  const [activeSection, setActiveSection] = useState<AdminSection>("songs");
  const [isRoomsExpanded, setIsRoomsExpanded] = useState(true);
  const [selectedUserProfile, setSelectedUserProfile] = useState<string | null>(
    null
  );
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [songs, setSongs] = useState<CachedSongMetadata[]>([]);
  const [songSearch, setSongSearch] = useState("");
  const [visibleSongsCount, setVisibleSongsCount] = useState(SONGS_PER_PAGE);

  // Sidebar visibility and mobile detection
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [isFrameNarrow, setIsFrameNarrow] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] =
    useState<ImportStatus>(INITIAL_IMPORT_STATUS);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importStatusResetTimeoutRef = useRef<number | null>(null);

  const isAdmin = username?.toLowerCase() === "ryo";
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  const clearImportStatusResetTimer = useCallback(() => {
    if (importStatusResetTimeoutRef.current !== null) {
      window.clearTimeout(importStatusResetTimeoutRef.current);
      importStatusResetTimeoutRef.current = null;
    }
  }, []);

  const resetImportStatus = useCallback(() => {
    setImportStatus(INITIAL_IMPORT_STATUS);
  }, []);

  const scheduleImportStatusReset = useCallback(
    (delayMs: number = 10000) => {
      clearImportStatusResetTimer();
      importStatusResetTimeoutRef.current = window.setTimeout(() => {
        resetImportStatus();
      }, delayMs);
    },
    [clearImportStatusResetTimer, resetImportStatus]
  );

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!username || !authToken) return;
    if (isOffline) return; // Skip API calls when offline

    try {
      const response = await abortableFetch(`/api/admin?action=getStats`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "x-username": username,
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });
      if (response.ok) {
        const data = await response.json();
        // Merge with existing stats to preserve totalSongs (which comes from fetchSongs)
        setStats((prev) => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, [username, authToken, isOffline]);

  // Fetch users (uses admin API to get all users)
  const fetchUsers = useCallback(
    async (search: string = "") => {
      if (!username || !authToken) return;
      if (isOffline) return; // Skip API calls when offline

      setIsLoading(true);
      try {
        const response = await abortableFetch(`/api/admin?action=getAllUsers`, {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });
        const data = await response.json();
        // Sort users: banned first, then by most recently active
        let sortedUsers = (data.users || []).sort((a: User, b: User) => {
          // Banned users first
          if (a.banned && !b.banned) return -1;
          if (!a.banned && b.banned) return 1;
          // Then by last active (most recent first)
          return b.lastActive - a.lastActive;
        });
        // Filter by search query client-side
        if (search.length > 0) {
          const lowerSearch = search.toLowerCase();
          sortedUsers = sortedUsers.filter((u: User) =>
            u.username.toLowerCase().includes(lowerSearch)
          );
        }
        setUsers(sortedUsers);
        setVisibleUsersCount(USERS_PER_PAGE); // Reset pagination when fetching
      } catch (error) {
        console.error("Failed to fetch users:", error);
        toast.error(t("apps.admin.errors.failedToFetchUsers"));
      } finally {
        setIsLoading(false);
      }
    },
    [username, authToken, t, isOffline]
  );

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    if (!username || !authToken) return;
    if (isOffline) return; // Skip API calls when offline

    setIsLoading(true);
    try {
      const response = await abortableFetch(
        `/api/rooms?username=${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        }
      );
      const data = await response.json();
      setRooms(data.rooms || []);
    } catch (error) {
      console.error("Failed to fetch rooms:", error);
      toast.error(t("apps.admin.errors.failedToFetchRooms"));
    } finally {
      setIsLoading(false);
    }
  }, [username, authToken, t, isOffline]);

  // Fetch messages for a room
  const fetchRoomMessages = useCallback(
    async (roomId: string) => {
      if (!username || !authToken) return;
      if (isOffline) return; // Skip API calls when offline

      setIsLoading(true);
      try {
        const response = await abortableFetch(
          `/api/rooms/${encodeURIComponent(roomId)}/messages?limit=200`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-username": username,
            },
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        const data = await response.json();
        setRoomMessages(data.messages || []);
      } catch (error) {
        console.error("Failed to fetch messages:", error);
        toast.error(t("apps.admin.errors.failedToFetchMessages"));
      } finally {
        setIsLoading(false);
      }
    },
    [username, authToken, t, isOffline]
  );

  // Fetch songs from Redis cache
  const fetchSongs = useCallback(async () => {
    if (isOffline) return; // Skip API calls when offline

    setIsLoading(true);
    try {
      const allSongs = await listAllCachedSongMetadata();
      setSongs(allSongs);
      setStats((prev) => ({ ...prev, totalSongs: allSongs.length }));
      setVisibleSongsCount(SONGS_PER_PAGE);
    } catch (error) {
      console.error("Failed to fetch songs:", error);
      toast.error(
        t("apps.admin.errors.failedToFetchSongs", "Failed to fetch songs")
      );
    } finally {
      setIsLoading(false);
    }
  }, [t, isOffline]);

  // Delete user
  const deleteUser = useCallback(
    async (targetUsername: string) => {
      if (!username || !authToken) return;

      try {
        const response = await abortableFetch(`/api/admin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
          body: JSON.stringify({
            action: "deleteUser",
            targetUsername,
          }),
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });

        if (response.ok) {
          toast.success(
            t("apps.admin.messages.userDeleted", { username: targetUsername })
          );
          fetchUsers(userSearch);
          fetchStats();
        } else {
          const data = await response.json();
          toast.error(data.error || t("apps.admin.errors.failedToDeleteUser"));
        }
      } catch (error) {
        console.error("Failed to delete user:", error);
        toast.error(t("apps.admin.errors.failedToDeleteUser"));
      }
    },
    [username, authToken, userSearch, fetchUsers, fetchStats, t]
  );

  // Delete room
  const deleteRoom = useCallback(
    async (roomId: string) => {
      if (!username || !authToken) return;

      try {
        const response = await abortableFetch(
          `/api/rooms/${encodeURIComponent(roomId)}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-username": username,
            },
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (response.ok) {
          toast.success(t("apps.admin.messages.roomDeleted"));
          fetchRooms();
          fetchStats();
          setSelectedRoomId(null);
          setRoomMessages([]);
        } else {
          const data = await response.json();
          toast.error(data.error || t("apps.admin.errors.failedToDeleteRoom"));
        }
      } catch (error) {
        console.error("Failed to delete room:", error);
        toast.error(t("apps.admin.errors.failedToDeleteRoom"));
      }
    },
    [username, authToken, fetchRooms, fetchStats, t]
  );

  // Delete message
  const deleteMessage = useCallback(
    async (roomId: string, messageId: string) => {
      if (!username || !authToken) return;

      try {
        const response = await abortableFetch(
          `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(
            messageId
          )}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-username": username,
            },
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (response.ok) {
          toast.success(t("apps.admin.messages.messageDeleted"));
          fetchRoomMessages(roomId);
        } else {
          const data = await response.json();
          toast.error(data.error || t("apps.admin.errors.failedToDeleteMessage"));
        }
      } catch (error) {
        console.error("Failed to delete message:", error);
        toast.error(t("apps.admin.errors.failedToDeleteMessage"));
      }
    },
    [username, authToken, fetchRoomMessages, t]
  );

  // Delete song
  const deleteSong = useCallback(
    async (youtubeId: string) => {
      if (!username || !authToken) return;

      try {
        const success = await deleteSongMetadata(youtubeId, {
          username,
          authToken,
        });

        if (success) {
          toast.success(t("apps.admin.messages.songDeleted", "Song deleted"));
          fetchSongs();
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
    },
    [username, authToken, fetchSongs, t]
  );

  // Handle import file selection
  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !username || !authToken) return;

      clearImportStatusResetTimer();
      setIsImporting(true);
      const startedAt = Date.now();
      setImportStatus({
        phase: "reading-file",
        fileName: file.name,
        fileSizeBytes: file.size,
        totalSongs: 0,
        processedSongs: 0,
        imported: 0,
        updated: 0,
        currentBatch: 0,
        totalBatches: 0,
        currentBatchSize: 0,
        message: "Reading file",
        error: null,
        startedAt,
        finishedAt: null,
      });

      try {
        const text = await file.text();
        setImportStatus((prev) => ({
          ...prev,
          phase: "parsing-file",
          message: "Parsing file",
        }));
        const data = JSON.parse(text);

        setImportStatus((prev) => ({
          ...prev,
          phase: "validating-data",
          message: "Validating file format",
        }));

        // Support both formats: { videos: [...] } or direct array
        const videos = data.videos || data;
        if (!Array.isArray(videos)) {
          const formatError = t(
            "apps.admin.errors.invalidImportFormat",
            "Invalid file format"
          );
          setImportStatus((prev) => ({
            ...prev,
            phase: "failed",
            message: formatError,
            error: formatError,
            finishedAt: Date.now(),
          }));
          toast.error(
            formatError
          );
          scheduleImportStatusReset();
          return;
        }

        setImportStatus((prev) => ({
          ...prev,
          phase: "preparing-songs",
          totalSongs: videos.length,
          processedSongs: 0,
          message: "Preparing songs for import",
        }));

        // Map to the expected song format, including content fields
        const songsToImport: Parameters<typeof bulkImportSongMetadata>[0] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (let i = 0; i < videos.length; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = videos[i] as Record<string, any>;
          songsToImport.push({
            id: v.id as string,
            url: v.url as string | undefined,
            title: v.title as string,
            artist: v.artist as string | undefined,
            album: v.album as string | undefined,
            lyricOffset: v.lyricOffset as number | undefined,
            lyricsSource: (v.lyricsSource || v.lyricsSearch?.selection) as {
              hash: string;
              albumId: string | number;
              title: string;
              artist: string;
              album?: string;
            } | undefined,
            // Include content fields (may be compressed gzip:base64 strings or raw objects)
            // These are passed through as-is to the API which handles decompression
            lyrics: v.lyrics,
            translations: v.translations,
            furigana: v.furigana,
            soramimi: v.soramimi,
            soramimiByLang: v.soramimiByLang,
            // Timestamps
            createdBy: v.createdBy as string | undefined,
            createdAt: v.createdAt as number | undefined,
            updatedAt: v.updatedAt as number | undefined,
            importOrder: v.importOrder as number | undefined,
          });

          const processedSongs = i + 1;
          if (
            processedSongs === videos.length ||
            processedSongs % IMPORT_PREPARE_PROGRESS_STEP === 0
          ) {
            setImportStatus((prev) => ({
              ...prev,
              phase: "preparing-songs",
              totalSongs: videos.length,
              processedSongs,
            }));
          }
        }

        const result = await bulkImportSongMetadata(songsToImport, {
          username,
          authToken,
        }, {
          onProgress: (progress: BulkImportProgress) => {
            const nextPhase =
              progress.stage === "error"
                ? "failed"
                : progress.stage === "complete"
                ? "refreshing-library"
                : progress.stage === "rate-limited"
                ? "waiting-rate-limit"
                : "uploading-batches";
            const message =
              progress.message ||
              (progress.stage === "batch-split"
                ? "Splitting batch to fit upload limits"
                : progress.stage === "batch-start"
                ? "Uploading songs"
                : progress.stage === "rate-limited"
                ? "Rate limited, waiting to retry"
                : progress.stage === "complete"
                ? "Import uploaded, refreshing library"
                : progress.stage === "error"
                ? "Import failed"
                : "Import progress updated");

            setImportStatus((prev) => ({
              ...prev,
              phase: nextPhase,
              totalSongs: progress.totalSongs || prev.totalSongs,
              processedSongs: progress.processedSongs,
              imported: progress.importedSongs,
              updated: progress.updatedSongs,
              currentBatch: progress.batchIndex,
              totalBatches: progress.batchCount,
              currentBatchSize: progress.batchSize,
              message,
              error: progress.stage === "error" ? message : null,
            }));
          },
        });

        if (result.success) {
          setImportStatus((prev) => ({
            ...prev,
            phase: "refreshing-library",
            processedSongs: result.total,
            imported: result.imported,
            updated: result.updated,
            message: "Refreshing song list",
            error: null,
          }));
          await fetchSongs();
          setImportStatus((prev) => ({
            ...prev,
            phase: "completed",
            totalSongs: result.total || prev.totalSongs,
            processedSongs: result.total,
            imported: result.imported,
            updated: result.updated,
            message: `Import complete: ${result.imported} new, ${result.updated} updated`,
            error: null,
            finishedAt: Date.now(),
          }));
          toast.success(
            t("apps.admin.messages.importSuccess", {
              imported: result.imported,
              updated: result.updated,
              total: result.total,
              defaultValue: `Imported ${result.imported} new, updated ${result.updated} (${result.total} total)`,
            })
          );
          scheduleImportStatusReset();
        } else {
          const errorMessage =
            result.error || t("apps.admin.errors.importFailed", "Import failed");
          setImportStatus((prev) => ({
            ...prev,
            phase: "failed",
            message: errorMessage,
            error: errorMessage,
            finishedAt: Date.now(),
          }));
          toast.error(
            errorMessage
          );
          scheduleImportStatusReset();
        }
      } catch (error) {
        console.error("Failed to import songs:", error);
        const fallbackError = t("apps.admin.errors.importFailed", "Import failed");
        const errorMessage =
          error instanceof Error && error.message ? error.message : fallbackError;
        setImportStatus((prev) => ({
          ...prev,
          phase: "failed",
          message: errorMessage,
          error: errorMessage,
          finishedAt: Date.now(),
        }));
        toast.error(fallbackError);
        scheduleImportStatusReset();
      } finally {
        setIsImporting(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [
      username,
      authToken,
      fetchSongs,
      t,
      clearImportStatusResetTimer,
      scheduleImportStatusReset,
    ]
  );

  // Compress and base64 encode a string (for large content fields)
  const compressToBase64 = useCallback(async (data: string): Promise<string> => {
    const encoder = new TextEncoder();
    const stream = new Blob([encoder.encode(data)]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
    const compressedBlob = await new Response(compressedStream).blob();
    const arrayBuffer = await compressedBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    // Convert to base64
    let binary = "";
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return "gzip:" + btoa(binary);
  }, []);

  // Handle export library
  const handleExportLibrary = useCallback(async () => {
    if (songs.length === 0) {
      toast.info(t("apps.admin.songs.noSongsToExport", "No songs to export"));
      return;
    }

    setIsExporting(true);

    try {
      // Fetch in batches to avoid oversized responses for large libraries.
      const songIds = Array.from(
        new Set(
          songs
            .map((song) => song.youtubeId)
            .filter((id): id is string => Boolean(id))
        )
      );
      const idBatches = chunkArray(songIds, EXPORT_FETCH_BATCH_SIZE);
      const fetchedSongs: ExportSongDocument[] = [];

      for (const idBatch of idBatches) {
        const idsParam = encodeURIComponent(idBatch.join(","));
        const response = await abortableFetch(
          getApiUrl(
            `/api/songs?ids=${idsParam}&include=metadata,lyrics,translations,furigana,soramimi`
          ),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            timeout: 30000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch songs batch: ${response.status}`);
        }

        const data = (await response.json()) as { songs?: ExportSongDocument[] };
        if (Array.isArray(data.songs)) {
          fetchedSongs.push(...data.songs);
        }
      }

      // Preserve UI ordering in the exported file.
      const songMap = new Map(fetchedSongs.map((song) => [song.id, song]));
      const fullSongs = songIds
        .map((id) => songMap.get(id))
        .filter((song): song is ExportSongDocument => Boolean(song));

      // Map songs to export format with compressed content
      const exportVideos: Record<string, unknown>[] = [];
      const songBatches = chunkArray(fullSongs, EXPORT_TRANSFORM_BATCH_SIZE);

      for (const songBatch of songBatches) {
        const exportBatch = await Promise.all(
          songBatch.map(async (song) => {
            const result: Record<string, unknown> = {
              // Metadata (never compressed - small and needs to be readable)
              id: song.id,
              title: song.title,
              artist: song.artist,
              album: song.album,
              lyricOffset: song.lyricOffset,
              lyricsSource: song.lyricsSource,
              createdBy: song.createdBy,
              createdAt: song.createdAt,
              updatedAt: song.updatedAt,
              importOrder: song.importOrder,
            };

            // Compress large content fields
            // Include cover in lyrics for backwards compatibility with old import format
            if (song.lyrics) {
              const lyricsWithCover = song.cover
                ? { ...song.lyrics, cover: song.cover }
                : song.lyrics;
              const lyricsJson = JSON.stringify(lyricsWithCover);
              result.lyrics =
                lyricsJson.length > 500
                  ? await compressToBase64(lyricsJson)
                  : lyricsWithCover;
            }
            if (song.translations && Object.keys(song.translations).length > 0) {
              const translationsJson = JSON.stringify(song.translations);
              result.translations =
                translationsJson.length > 500
                  ? await compressToBase64(translationsJson)
                  : song.translations;
            }
            if (song.furigana && song.furigana.length > 0) {
              const furiganaJson = JSON.stringify(song.furigana);
              result.furigana =
                furiganaJson.length > 500
                  ? await compressToBase64(furiganaJson)
                  : song.furigana;
            }
            if (song.soramimi && song.soramimi.length > 0) {
              const soramimiJson = JSON.stringify(song.soramimi);
              result.soramimi =
                soramimiJson.length > 500
                  ? await compressToBase64(soramimiJson)
                  : song.soramimi;
            }
            if (
              song.soramimiByLang &&
              Object.keys(song.soramimiByLang).length > 0
            ) {
              const soramimiByLangJson = JSON.stringify(song.soramimiByLang);
              result.soramimiByLang =
                soramimiByLangJson.length > 500
                  ? await compressToBase64(soramimiByLangJson)
                  : song.soramimiByLang;
            }

            return result;
          })
        );
        exportVideos.push(...exportBatch);
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: 3, // Version 3 supports compressed content
        compressed: true, // Indicates content fields may be compressed
        videos: exportVideos,
      };

      // Create and download the file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ryos-library-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        t("apps.admin.messages.exportSuccess", {
          count: exportVideos.length,
          defaultValue: `Exported ${exportVideos.length} songs`,
        })
      );
    } catch (error) {
      console.error("Failed to export library:", error);
      toast.error(t("apps.admin.errors.exportFailed", "Export failed"));
    } finally {
      setIsExporting(false);
    }
  }, [songs, t, compressToBase64]);

  // Prompt delete all songs (opens dialog)
  const handleDeleteAllSongs = useCallback(() => {
    setDeleteTarget({
      type: "allSongs",
      id: "all",
      name: t("apps.admin.songs.allSongs", "all songs"),
    });
    setIsDeleteDialogOpen(true);
  }, [t]);

  // Execute delete all songs (called from confirm dialog)
  const executeDeleteAllSongs = useCallback(async () => {
    if (!username || !authToken) return;

    setIsDeletingAll(true);

    try {
      const result = await deleteAllSongMetadata({ username, authToken });

      if (result.success > 0) {
        toast.success(
          t("apps.admin.messages.deleteAllSuccess", {
            count: result.success,
            total: result.total,
            defaultValue: `Deleted ${result.success} of ${result.total} songs`,
          })
        );
        fetchSongs();
      } else if (result.total === 0) {
        toast.info(
          t("apps.admin.messages.noSongsToDelete", "No songs to delete")
        );
      } else {
        toast.error(
          t("apps.admin.errors.deleteAllFailed", "Failed to delete songs")
        );
      }
    } catch (error) {
      console.error("Failed to delete all songs:", error);
      toast.error(
        t("apps.admin.errors.deleteAllFailed", "Failed to delete songs")
      );
    } finally {
      setIsDeletingAll(false);
    }
  }, [username, authToken, fetchSongs, t]);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;

    switch (deleteTarget.type) {
      case "user":
        deleteUser(deleteTarget.id);
        break;
      case "room":
        deleteRoom(deleteTarget.id);
        break;
      case "message":
        if (selectedRoomId) {
          deleteMessage(selectedRoomId, deleteTarget.id);
        }
        break;
      case "song":
        deleteSong(deleteTarget.id);
        break;
      case "allSongs":
        executeDeleteAllSongs();
        break;
    }
    setDeleteTarget(null);
    setIsDeleteDialogOpen(false);
  }, [
    deleteTarget,
    selectedRoomId,
    deleteUser,
    deleteRoom,
    deleteMessage,
    deleteSong,
    executeDeleteAllSongs,
  ]);

  // Prompt for delete
  const promptDelete = useCallback(
    (type: "user" | "room" | "message" | "song", id: string, name: string) => {
      setDeleteTarget({ type, id, name });
      setIsDeleteDialogOpen(true);
    },
    []
  );

  // Load data on mount
  useEffect(() => {
    if (isAdmin && isWindowOpen) {
      fetchRooms();
      fetchStats();
      fetchSongs();
    }
  }, [isAdmin, isWindowOpen, fetchRooms, fetchStats, fetchSongs]);

  useEffect(() => {
    return () => {
      clearImportStatusResetTimer();
    };
  }, [clearImportStatusResetTimer]);

  // Handle user search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(userSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, fetchUsers]);

  // Fetch room messages when room is selected
  useEffect(() => {
    if (selectedRoomId) {
      fetchRoomMessages(selectedRoomId);
    }
  }, [selectedRoomId, fetchRoomMessages]);

  const handleRefresh = useCallback(() => {
    if (isOffline) {
      toast.error(t("common.offline", "You are offline"));
      return;
    }
    fetchRooms();
    fetchStats();
    fetchSongs();
    if (selectedRoomId) {
      fetchRoomMessages(selectedRoomId);
    }
    fetchUsers(userSearch);
    toast.success(t("apps.admin.messages.dataRefreshed"));
  }, [
    fetchRooms,
    fetchStats,
    fetchSongs,
    fetchRoomMessages,
    fetchUsers,
    selectedRoomId,
    userSearch,
    t,
    isOffline,
  ]);

  // Toggle sidebar visibility
  const toggleSidebarVisibility = useCallback(() => {
    setIsSidebarVisible((prev) => !prev);
  }, []);

  // Detect narrow frame for mobile layout
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = (width: number) => {
      const narrow = width < 550;
      setIsFrameNarrow(narrow);
      // Collapse sidebar by default on mobile
      if (narrow && isSidebarVisible) {
        setIsSidebarVisible(false);
      }
    };

    // Initial measurement
    updateWidth(containerRef.current.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        updateWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
    // Only run on mount to set initial state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-show sidebar when transitioning from narrow to wide
  const prevFrameNarrowRef = useRef(isFrameNarrow);
  useEffect(() => {
    if (prevFrameNarrowRef.current && !isFrameNarrow) {
      // Transitioned from narrow -> wide
      if (!isSidebarVisible) {
        setIsSidebarVisible(true);
      }
    }
    prevFrameNarrowRef.current = isFrameNarrow;
  }, [isFrameNarrow, isSidebarVisible]);

  // Scroll to top when navigating to detail views
  useEffect(() => {
    if (selectedSongId || selectedUserProfile) {
      const viewport = scrollAreaRef.current?.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (viewport) {
        viewport.scrollTo({ top: 0 });
      }
    }
  }, [selectedSongId, selectedUserProfile]);

  const formatRelativeTime = useCallback(
    (timestamp: number) => {
      const diff = Date.now() - timestamp;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return t("apps.admin.time.now");
      if (minutes < 60)
        return t("apps.admin.time.minutesAgo", { count: minutes });
      if (hours < 24) return t("apps.admin.time.hoursAgo", { count: hours });
      return t("apps.admin.time.daysAgo", { count: days });
    },
    [t]
  );

  return {
    t,
    translatedHelpItems,
    username,
    isAdmin,
    isOffline,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    deleteTarget,
    users,
    rooms,
    selectedRoomId,
    setSelectedRoomId,
    roomMessages,
    userSearch,
    setUserSearch,
    isLoading,
    visibleUsersCount,
    setVisibleUsersCount,
    USERS_PER_PAGE,
    stats,
    activeSection,
    setActiveSection,
    isRoomsExpanded,
    setIsRoomsExpanded,
    selectedUserProfile,
    setSelectedUserProfile,
    selectedSongId,
    setSelectedSongId,
    songs,
    songSearch,
    setSongSearch,
    visibleSongsCount,
    setVisibleSongsCount,
    SONGS_PER_PAGE,
    containerRef,
    scrollAreaRef,
    isSidebarVisible,
    toggleSidebarVisibility,
    isImporting,
    importStatus,
    isExporting,
    isDeletingAll,
    fileInputRef,
    selectedRoom,
    fetchUsers,
    fetchStats,
    fetchSongs,
    deleteMessage,
    handleImportFile,
    handleExportLibrary,
    handleDeleteAllSongs,
    handleDeleteConfirm,
    handleRefresh,
    promptDelete,
    formatRelativeTime,
    formatKugouImageUrl,
  };
}
