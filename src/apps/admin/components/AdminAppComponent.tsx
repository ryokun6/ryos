import { useState, useEffect, useCallback, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AdminMenuBar } from "./AdminMenuBar";
import { AdminSidebar } from "./AdminSidebar";
import { UserProfilePanel } from "./UserProfilePanel";
import { SongDetailPanel } from "./SongDetailPanel";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useAuth } from "@/hooks/useAuth";
import { useOffline } from "@/hooks/useOffline";
import { useThemeStore } from "@/stores/useThemeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Trash2, RefreshCw, AlertTriangle, Ban, Music, Upload, Download, WifiOff } from "lucide-react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { listAllCachedSongMetadata, deleteSongMetadata, deleteAllSongMetadata, bulkImportSongMetadata, CachedSongMetadata } from "@/utils/songMetadataCache";
import { getApiUrl } from "@/utils/platform";

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

type AdminSection = "users" | "rooms" | "songs";

export function AdminAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("admin", helpItems);
  const { username, authToken } = useAuth();
  const isOffline = useOffline();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "user" | "room" | "message" | "song" | "allSongs";
    id: string;
    name: string;
  } | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [visibleUsersCount, setVisibleUsersCount] = useState(100);
  const USERS_PER_PAGE = 100;
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalRooms: 0,
    totalMessages: 0,
  });

  const [activeSection, setActiveSection] = useState<AdminSection>("songs");
  const [isRoomsExpanded, setIsRoomsExpanded] = useState(true);
  const [selectedUserProfile, setSelectedUserProfile] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [songs, setSongs] = useState<CachedSongMetadata[]>([]);
  const [songSearch, setSongSearch] = useState("");
  const [visibleSongsCount, setVisibleSongsCount] = useState(100);
  const SONGS_PER_PAGE = 100;
  

  // Sidebar visibility and mobile detection
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFrameNarrow, setIsFrameNarrow] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = username?.toLowerCase() === "ryo";
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!username || !authToken) return;
    if (isOffline) return; // Skip API calls when offline

    try {
      const response = await fetch(`/api/admin?action=getStats`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "x-username": username,
        },
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
  const fetchUsers = useCallback(async (search: string = "") => {
    if (!username || !authToken) return;
    if (isOffline) return; // Skip API calls when offline

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin?action=getAllUsers`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "x-username": username,
        },
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
  }, [username, authToken, t, USERS_PER_PAGE, isOffline]);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    if (!username || !authToken) return;
    if (isOffline) return; // Skip API calls when offline

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/chat-rooms?action=getRooms&username=${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
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
        const response = await fetch(
          `/api/chat-rooms?action=getMessages&roomId=${encodeURIComponent(roomId)}&limit=200`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              "x-username": username,
            },
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
      toast.error(t("apps.admin.errors.failedToFetchSongs", "Failed to fetch songs"));
    } finally {
      setIsLoading(false);
    }
  }, [t, SONGS_PER_PAGE, isOffline]);

  // Delete user
  const deleteUser = useCallback(
    async (targetUsername: string) => {
      if (!username || !authToken) return;

      try {
        const response = await fetch(`/api/admin`, {
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
        });

        if (response.ok) {
          toast.success(t("apps.admin.messages.userDeleted", { username: targetUsername }));
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
        const params = new URLSearchParams({
          action: "deleteRoom",
          roomId,
        });
        const response = await fetch(`/api/chat-rooms?${params}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
        });

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
        const params = new URLSearchParams({
          action: "deleteMessage",
          roomId,
          messageId,
        });
        const response = await fetch(`/api/chat-rooms?${params}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
        });

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
        const success = await deleteSongMetadata(youtubeId, { username, authToken });

        if (success) {
          toast.success(t("apps.admin.messages.songDeleted", "Song deleted"));
          fetchSongs();
        } else {
          toast.error(t("apps.admin.errors.failedToDeleteSong", "Failed to delete song"));
        }
      } catch (error) {
        console.error("Failed to delete song:", error);
        toast.error(t("apps.admin.errors.failedToDeleteSong", "Failed to delete song"));
      }
    },
    [username, authToken, fetchSongs, t]
  );

  // Handle import file selection
  const handleImportFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !username || !authToken) return;

      setIsImporting(true);

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Support both formats: { videos: [...] } or direct array
        const videos = data.videos || data;
        if (!Array.isArray(videos)) {
          toast.error(t("apps.admin.errors.invalidImportFormat", "Invalid file format"));
          return;
        }

        // Map to the expected song format, including content fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const songs = videos.map((v: Record<string, any>) => ({
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
        }));

        const result = await bulkImportSongMetadata(songs, { username, authToken });

        if (result.success) {
          toast.success(
            t("apps.admin.messages.importSuccess", {
              imported: result.imported,
              updated: result.updated,
              total: result.total,
              defaultValue: `Imported ${result.imported} new, updated ${result.updated} (${result.total} total)`,
            })
          );
          fetchSongs();
        } else {
          toast.error(result.error || t("apps.admin.errors.importFailed", "Import failed"));
        }
      } catch (error) {
        console.error("Failed to import songs:", error);
        toast.error(t("apps.admin.errors.importFailed", "Import failed"));
      } finally {
        setIsImporting(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [username, authToken, fetchSongs, t]
  );

  // Compress and base64 encode a string (for large content fields)
  const compressToBase64 = async (data: string): Promise<string> => {
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
  };

  // Handle export library
  const handleExportLibrary = useCallback(async () => {
    if (songs.length === 0) {
      toast.info(t("apps.admin.songs.noSongsToExport", "No songs to export"));
      return;
    }

    setIsExporting(true);

    try {
      // Fetch full song data including content (lyrics, translations, furigana, soramimi)
      const response = await fetch(
        getApiUrl("/api/song?include=metadata,lyrics,translations,furigana,soramimi"),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch songs: ${response.status}`);
      }

      const data = await response.json();
      const fullSongs = data.songs || [];

      // Map songs to export format with compressed content
      const exportVideos = await Promise.all(fullSongs.map(async (song: {
        id: string;
        title: string;
        artist?: string;
        album?: string;
        cover?: string; // Cover is now in metadata
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
      }) => {
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
          result.lyrics = lyricsJson.length > 500 ? await compressToBase64(lyricsJson) : lyricsWithCover;
        }
        if (song.translations && Object.keys(song.translations).length > 0) {
          const translationsJson = JSON.stringify(song.translations);
          result.translations = translationsJson.length > 500 ? await compressToBase64(translationsJson) : song.translations;
        }
        if (song.furigana && song.furigana.length > 0) {
          const furiganaJson = JSON.stringify(song.furigana);
          result.furigana = furiganaJson.length > 500 ? await compressToBase64(furiganaJson) : song.furigana;
        }
        if (song.soramimi && song.soramimi.length > 0) {
          const soramimiJson = JSON.stringify(song.soramimi);
          result.soramimi = soramimiJson.length > 500 ? await compressToBase64(soramimiJson) : song.soramimi;
        }
        if (song.soramimiByLang && Object.keys(song.soramimiByLang).length > 0) {
          const soramimiByLangJson = JSON.stringify(song.soramimiByLang);
          result.soramimiByLang = soramimiByLangJson.length > 500 ? await compressToBase64(soramimiByLangJson) : song.soramimiByLang;
        }

        return result;
      }));

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: 3, // Version 3 supports compressed content
        compressed: true, // Indicates content fields may be compressed
        videos: exportVideos,
      };

      // Create and download the file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ryos-library-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        t("apps.admin.messages.exportSuccess", {
          count: fullSongs.length,
          defaultValue: `Exported ${fullSongs.length} songs`,
        })
      );
    } catch (error) {
      console.error("Failed to export library:", error);
      toast.error(t("apps.admin.errors.exportFailed", "Export failed"));
    } finally {
      setIsExporting(false);
    }
  }, [songs.length, t]);

  // Prompt delete all songs (opens dialog)
  const handleDeleteAllSongs = useCallback(() => {
    setDeleteTarget({ type: "allSongs", id: "all", name: t("apps.admin.songs.allSongs", "all songs") });
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
        toast.info(t("apps.admin.messages.noSongsToDelete", "No songs to delete"));
      } else {
        toast.error(t("apps.admin.errors.deleteAllFailed", "Failed to delete songs"));
      }
    } catch (error) {
      console.error("Failed to delete all songs:", error);
      toast.error(t("apps.admin.errors.deleteAllFailed", "Failed to delete songs"));
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
  }, [deleteTarget, selectedRoomId, deleteUser, deleteRoom, deleteMessage, deleteSong, executeDeleteAllSongs]);

  // Prompt for delete
  const promptDelete = (
    type: "user" | "room" | "message" | "song",
    id: string,
    name: string
  ) => {
    setDeleteTarget({ type, id, name });
    setIsDeleteDialogOpen(true);
  };

  // Load data on mount
  useEffect(() => {
    if (isAdmin && isWindowOpen) {
      fetchRooms();
      fetchStats();
      fetchSongs();
    }
  }, [isAdmin, isWindowOpen, fetchRooms, fetchStats, fetchSongs]);

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

  const menuBar = (
    <AdminMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onRefresh={handleRefresh}
      onToggleSidebar={toggleSidebarVisibility}
      isSidebarVisible={isSidebarVisible}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
    />
  );

  if (!isWindowOpen) return null;

  // Access denied view
  if (!isAdmin) {
    return (
      <>
        {!isXpTheme && isForeground && menuBar}
        <WindowFrame
          title={t("apps.admin.title")}
          onClose={onClose}
          isForeground={isForeground}
          appId="admin"
          skipInitialSound={skipInitialSound}
          instanceId={instanceId}
          onNavigateNext={onNavigateNext}
          onNavigatePrevious={onNavigatePrevious}
          menuBar={isXpTheme ? menuBar : undefined}
        >
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center bg-white">
            <AlertTriangle className="h-10 w-10 text-neutral-400" />
            <h2 className="text-sm font-bold">{t("apps.admin.accessDenied.title")}</h2>
            <p className="text-xs text-neutral-500 max-w-xs">
              {t("apps.admin.accessDenied.description")}
            </p>
            {!username && (
              <p className="text-[11px] text-neutral-400">
                {t("apps.admin.accessDenied.loginPrompt")}
              </p>
            )}
          </div>
        </WindowFrame>
      </>
    );
  }

  // Offline view
  if (isOffline) {
    return (
      <>
        {!isXpTheme && isForeground && menuBar}
        <WindowFrame
          title={t("apps.admin.title")}
          onClose={onClose}
          isForeground={isForeground}
          appId="admin"
          skipInitialSound={skipInitialSound}
          instanceId={instanceId}
          onNavigateNext={onNavigateNext}
          onNavigatePrevious={onNavigatePrevious}
          menuBar={isXpTheme ? menuBar : undefined}
        >
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center bg-white">
            <WifiOff className="h-10 w-10 text-neutral-400" />
            <h2 className="text-sm font-bold">{t("apps.admin.offline.title", "Offline")}</h2>
            <p className="text-xs text-neutral-500 max-w-xs">
              {t("apps.admin.offline.description", "Admin requires an internet connection to manage data.")}
            </p>
          </div>
        </WindowFrame>
      </>
    );
  }

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.admin.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="admin"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div ref={containerRef} className="flex h-full w-full">
          {/* Sidebar */}
          <AdminSidebar
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onRoomSelect={setSelectedRoomId}
            isRoomsExpanded={isRoomsExpanded}
            onToggleRoomsExpanded={() => setIsRoomsExpanded(!isRoomsExpanded)}
            stats={stats}
            isVisible={isSidebarVisible}
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Toolbar */}
            {!selectedUserProfile && !selectedSongId && (
              <div
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 border-b",
                  isXpTheme
                    ? "border-[#919b9c]"
                    : currentTheme === "macosx"
                    ? "border-black/10"
                    : "border-black/20"
                )}
                style={
                  currentTheme === "macosx"
                    ? { backgroundImage: "var(--os-pinstripe-window)" }
                    : undefined
                }
              >
                {activeSection === "users" && !selectedRoomId && (
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                    <Input
                      placeholder={t("apps.admin.search.placeholder")}
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-7 h-7 text-[12px]"
                    />
                  </div>
                )}

                {activeSection === "songs" && !selectedRoomId && (
                  <>
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                      <Input
                        placeholder={t("apps.admin.search.songsPlaceholder", "Search songs...")}
                        value={songSearch}
                        onChange={(e) => setSongSearch(e.target.value)}
                        className="pl-7 h-7 text-[12px]"
                      />
                    </div>
                    {/* Import button */}
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
                      className="h-7 w-7 p-0"
                      title={t("apps.admin.songs.import", "Import Library")}
                    >
                      {isImporting ? (
                        <ActivityIndicator size={14} />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {/* Export button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExportLibrary}
                      disabled={isExporting || isImporting || isDeletingAll || songs.length === 0}
                      className="h-7 w-7 p-0"
                      title={t("apps.admin.songs.export", "Export Library")}
                    >
                      {isExporting ? (
                        <ActivityIndicator size={14} />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {/* Delete all button */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteAllSongs}
                      disabled={isDeletingAll || isImporting || songs.length === 0}
                      className="h-7 w-7 p-0"
                      title={t("apps.admin.songs.deleteAll", "Delete All Songs")}
                    >
                      {isDeletingAll ? (
                        <ActivityIndicator size={14} />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </>
                )}

                {selectedRoomId && selectedRoom && (
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[12px] font-medium">
                      #{" "}
                      {selectedRoom.name}
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {t("apps.admin.room.messagesCount", { count: roomMessages.length })}
                    </span>
                  </div>
                )}

                {selectedRoomId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => promptDelete("room", selectedRoomId, selectedRoom?.name || "")}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  className="h-7 w-7 p-0"
                >
                  {isLoading ? (
                    <ActivityIndicator size={14} />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            )}

            {/* Content Area */}
            <ScrollArea className="flex-1">
              {/* User Profile View */}
              {selectedUserProfile && (
                <UserProfilePanel
                  username={selectedUserProfile}
                  onBack={() => setSelectedUserProfile(null)}
                  onUserDeleted={() => {
                    fetchUsers(userSearch);
                    fetchStats();
                  }}
                />
              )}

              {/* Song Detail View */}
              {selectedSongId && (
                <SongDetailPanel
                  youtubeId={selectedSongId}
                  onBack={() => setSelectedSongId(null)}
                  onSongDeleted={() => {
                    fetchSongs();
                    fetchStats();
                  }}
                />
              )}

              {/* Users View */}
              {activeSection === "users" && !selectedRoomId && !selectedUserProfile && (
                <div className="font-geneva-12">
                  {users.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <Search className="h-8 w-8 mb-2 opacity-50" />
                      <span className="text-[11px]">
                        {t("apps.admin.search.noResults")}
                      </span>
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px] border-none font-normal">
                            <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                              {t("apps.admin.tableHeaders.username")}
                            </TableHead>
                            <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                              {t("apps.admin.tableHeaders.status")}
                            </TableHead>
                            <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                              {t("apps.admin.tableHeaders.lastActive")}
                            </TableHead>
                            <TableHead className="font-normal bg-gray-100/50 h-[28px] w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-[11px]">
                          {users.slice(0, visibleUsersCount).map((user) => (
                            <TableRow
                              key={user.username}
                              className={cn(
                                "border-none hover:bg-gray-100/50 transition-colors cursor-pointer odd:bg-gray-200/50 group",
                                user.banned && "bg-red-50/50 odd:bg-red-50/70"
                              )}
                              onClick={() => setSelectedUserProfile(user.username)}
                            >
                              <TableCell className="flex items-center gap-2">
                                <div className={cn(
                                  "w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium",
                                  user.banned 
                                    ? "bg-red-200 text-red-700" 
                                    : "bg-neutral-200 text-neutral-600"
                                )}>
                                  {user.username[0].toUpperCase()}
                                </div>
                                {user.username}
                              </TableCell>
                              <TableCell>
                                {user.banned ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded">
                                    <Ban className="h-2.5 w-2.5" />
                                    {t("apps.admin.user.banned")}
                                  </span>
                                ) : user.username.toLowerCase() === "ryo" ? (
                                  <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded">
                                    {t("apps.admin.user.admin")}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 text-[9px] bg-green-100 text-green-700 rounded">
                                    {t("apps.admin.user.active")}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatRelativeTime(user.lastActive)}
                              </TableCell>
                              <TableCell>
                                {user.username !== "ryo" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      promptDelete("user", user.username, user.username);
                                    }}
                                    className="h-5 w-5 p-0 md:opacity-0 md:group-hover:opacity-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {users.length > visibleUsersCount && (
                        <div className="pt-2 pb-1 flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleUsersCount((prev) => prev + USERS_PER_PAGE)}
                            className="h-7 text-[11px] text-neutral-500 hover:text-neutral-700"
                          >
                            {t("apps.admin.loadMore", { remaining: users.length - visibleUsersCount })}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Songs View */}
              {activeSection === "songs" && !selectedRoomId && !selectedUserProfile && !selectedSongId && (
                <div className="font-geneva-12">
                  {songs.length === 0 && !isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <Music className="h-8 w-8 mb-2 opacity-50" />
                      <span className="text-[11px]">
                        {t("apps.admin.songs.noSongs", "No songs in cache")}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-gray-200">
                        {songs
                          .filter((song) =>
                            songSearch.length === 0 ||
                            song.title.toLowerCase().includes(songSearch.toLowerCase()) ||
                            (song.artist?.toLowerCase().includes(songSearch.toLowerCase()) ?? false)
                          )
                          .slice(0, visibleSongsCount)
                          .map((song) => (
                            <div
                              key={song.youtubeId}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100/50 transition-colors cursor-pointer group"
                              onClick={() => setSelectedSongId(song.youtubeId)}
                            >
                              {/* Cover Image */}
                              <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-200">
                                <img
                                  src={`https://i.ytimg.com/vi/${song.youtubeId}/default.jpg`}
                                  alt={song.title}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                              {/* Title and Artist */}
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium truncate" title={song.title}>
                                  {song.title}
                                </div>
                                <div className="text-[11px] text-neutral-500 truncate" title={song.artist}>
                                  {song.artist || "-"}
                                </div>
                              </div>
                              {/* Delete Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  promptDelete("song", song.youtubeId, song.title);
                                }}
                                className="h-6 w-6 p-0 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                      </div>
                      {songs.filter((song) =>
                        songSearch.length === 0 ||
                        song.title.toLowerCase().includes(songSearch.toLowerCase()) ||
                        (song.artist?.toLowerCase().includes(songSearch.toLowerCase()) ?? false)
                      ).length > visibleSongsCount && (
                        <div className="pt-2 pb-1 flex justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleSongsCount((prev) => prev + SONGS_PER_PAGE)}
                            className="h-7 text-[11px] text-neutral-500 hover:text-neutral-700"
                          >
                            {t("apps.admin.loadMore", {
                              remaining: songs.filter((song) =>
                                songSearch.length === 0 ||
                                song.title.toLowerCase().includes(songSearch.toLowerCase()) ||
                                (song.artist?.toLowerCase().includes(songSearch.toLowerCase()) ?? false)
                              ).length - visibleSongsCount,
                            })}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Room Messages View */}
              {selectedRoomId && !selectedUserProfile && (
                <div className="font-geneva-12">
                  {roomMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <span className="text-[11px]">{t("apps.admin.room.noMessages")}</span>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px] border-none font-normal">
                          <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                            {t("apps.admin.tableHeaders.user")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[28px]">
                            {t("apps.admin.tableHeaders.message")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
                            {t("apps.admin.tableHeaders.time")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[28px] w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-[11px]">
                        {roomMessages.map((message) => (
                          <TableRow
                            key={message.id}
                            className="border-none hover:bg-gray-100/50 transition-colors cursor-default odd:bg-gray-200/50 group"
                          >
                            <TableCell className="flex items-center gap-2 whitespace-nowrap">
                              <div className="w-4 h-4 rounded-full bg-neutral-200 flex items-center justify-center text-[9px] font-medium text-neutral-600">
                                {message.username[0].toUpperCase()}
                              </div>
                              {message.username}
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              <span className="truncate block">{message.content}</span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatRelativeTime(message.timestamp)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (selectedRoomId) {
                                    deleteMessage(selectedRoomId, message.id);
                                  }
                                }}
                                className="h-5 w-5 p-0 md:opacity-0 md:group-hover:opacity-100 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Status Bar */}
            <div className="os-status-bar os-status-bar-text flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12 bg-gray-100 border-t border-gray-300">
              <span>
                {activeSection === "users" && !selectedRoomId
                  ? t("apps.admin.statusBar.usersCount", { count: users.length })
                  : activeSection === "songs" && !selectedRoomId
                  ? t("apps.admin.statusBar.songsCount", { count: songs.length, defaultValue: `${songs.length} songs` })
                  : selectedRoomId
                  ? t("apps.admin.statusBar.messagesCount", { count: roomMessages.length })
                  : t("apps.admin.statusBar.roomsCount", { count: rooms.length })}
              </span>
              <span>
                {t("apps.admin.statusBar.loggedInAs", { username })}
              </span>
            </div>
          </div>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="admin"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="admin"
        />
        <ConfirmDialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDeleteConfirm}
          title={t("apps.admin.dialogs.deleteTitle", { type: deleteTarget?.type })}
          description={t("apps.admin.dialogs.deleteDescription", { type: deleteTarget?.type, name: deleteTarget?.name })}
        />
      </WindowFrame>
    </>
  );
}
