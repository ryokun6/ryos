import { useState, useEffect, useCallback, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  banAdminUser,
  clearAdminUserMemories,
  deleteAdminUser,
  forceAdminDailyNotes,
  getAdminUserHeartbeats,
  getAdminUserMemories,
  getAdminUserMessages,
  getAdminUserProfile,
  unbanAdminUser,
} from "@/api/admin";
import { ApiRequestError } from "@/api/core";
import {
  HEARTBEAT_LOOKBACK_DAYS,
  RECENT_MESSAGES_LIMIT,
  type DailyNote,
  type HeartbeatRecord,
  type UserMemory,
  type UserMessage,
  type UserProfile,
  type UserProfilePanelProps,
} from "./types";
import {
  initialUiState,
  profileUiReducer,
} from "./profile-ui-reducer";

export function useUserProfilePanel({
  username,
  onBack,
  onUserDeleted,
}: UserProfilePanelProps) {

  const { t } = useTranslation();
  const { username: currentUser, isAuthenticated } = useAuth();
  const [uiState, dispatchUi] = useReducer(profileUiReducer, initialUiState);
  const {
    expandedMemories,
    expandedDailyNotes,
    expandedHeartbeats,
    banReason,
    showBanInput,
    isRoomsOpen,
    isMessagesOpen,
    isMemoriesOpen,
    isHeartbeatsOpen,
    hasLoadedMessages,
    hasLoadedMemories,
    hasLoadedHeartbeats,
    isMessagesLoading,
    isMemoriesLoading,
    isHeartbeatsLoading,
  } = uiState;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [heartbeats, setHeartbeats] = useState<HeartbeatRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [isClearMemoryDialogOpen, setIsClearMemoryDialogOpen] = useState(false);
  const [isForceProcessDialogOpen, setIsForceProcessDialogOpen] = useState(false);
  const [isClearingMemory, setIsClearingMemory] = useState(false);
  const [isProcessingNotes, setIsProcessingNotes] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      const data = await getAdminUserProfile<UserProfile>(username);
      setProfile(data);
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      toast.error(t("apps.admin.errors.failedToFetchProfile"));
    }
  }, [username, isAuthenticated, currentUser, t]);

  const fetchMessages = useCallback(async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      const data = await getAdminUserMessages<{ messages?: UserMessage[] }>(
        username,
        RECENT_MESSAGES_LIMIT
      );
      setMessages(data.messages || []);
      return true;
    } catch (error) {
      console.error("Failed to fetch messages:", error);
      return false;
    }
  }, [username, isAuthenticated, currentUser]);

  const fetchMemories = useCallback(async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      const data = await getAdminUserMemories<{
        memories?: UserMemory[];
        dailyNotes?: DailyNote[];
      }>(username);
      setMemories(data.memories || []);
      setDailyNotes(data.dailyNotes || []);
      return true;
    } catch (error) {
      console.error("Failed to fetch memories:", error);
      return false;
    }
  }, [username, isAuthenticated, currentUser]);

  const fetchHeartbeats = useCallback(async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      const data = await getAdminUserHeartbeats<{
        heartbeats?: HeartbeatRecord[];
      }>(username, HEARTBEAT_LOOKBACK_DAYS);
      setHeartbeats(data.heartbeats || []);
      return true;
    } catch (error) {
      console.error("Failed to fetch heartbeats:", error);
      return false;
    }
  }, [username, isAuthenticated, currentUser]);

  const toggleMemory = useCallback((key: string) => {
    dispatchUi({ type: "toggleMemory", key });
  }, []);

  const toggleDailyNote = useCallback((date: string) => {
    dispatchUi({ type: "toggleDailyNote", date });
  }, []);

  const toggleHeartbeat = useCallback((id: string) => {
    dispatchUi({ type: "toggleHeartbeat", id });
  }, []);

  useEffect(() => {
    setProfile(null);
    setMessages([]);
    setMemories([]);
    setDailyNotes([]);
    setHeartbeats([]);
    dispatchUi({ type: "resetForUsername" });
    setIsLoading(true);
    fetchProfile().finally(() => {
      setIsLoading(false);
    });
  }, [fetchProfile]);

  const loadMessages = useCallback(async () => {
    if (hasLoadedMessages || isMessagesLoading) return;
    dispatchUi({ type: "set", payload: { isMessagesLoading: true } });
    try {
      const didLoad = await fetchMessages();
      if (didLoad) {
        dispatchUi({ type: "set", payload: { hasLoadedMessages: true } });
      }
    } finally {
      dispatchUi({ type: "set", payload: { isMessagesLoading: false } });
    }
  }, [fetchMessages, hasLoadedMessages, isMessagesLoading]);

  const loadMemories = useCallback(async () => {
    if (hasLoadedMemories || isMemoriesLoading) return;
    dispatchUi({ type: "set", payload: { isMemoriesLoading: true } });
    try {
      const didLoad = await fetchMemories();
      if (didLoad) {
        dispatchUi({ type: "set", payload: { hasLoadedMemories: true } });
      }
    } finally {
      dispatchUi({ type: "set", payload: { isMemoriesLoading: false } });
    }
  }, [fetchMemories, hasLoadedMemories, isMemoriesLoading]);

  const loadHeartbeats = useCallback(async () => {
    if (hasLoadedHeartbeats || isHeartbeatsLoading) return;
    dispatchUi({ type: "set", payload: { isHeartbeatsLoading: true } });
    try {
      const didLoad = await fetchHeartbeats();
      if (didLoad) {
        dispatchUi({ type: "set", payload: { hasLoadedHeartbeats: true } });
      }
    } finally {
      dispatchUi({ type: "set", payload: { isHeartbeatsLoading: false } });
    }
  }, [fetchHeartbeats, hasLoadedHeartbeats, isHeartbeatsLoading]);

  const toggleMessagesSection = useCallback(() => {
    const nextIsOpen = !isMessagesOpen;
    dispatchUi({ type: "set", payload: { isMessagesOpen: nextIsOpen } });
    if (nextIsOpen && !hasLoadedMessages && !isMessagesLoading) {
      void loadMessages();
    }
  }, [hasLoadedMessages, isMessagesLoading, isMessagesOpen, loadMessages]);

  const toggleMemoriesSection = useCallback(() => {
    const nextIsOpen = !isMemoriesOpen;
    dispatchUi({ type: "set", payload: { isMemoriesOpen: nextIsOpen } });
    if (nextIsOpen && !hasLoadedMemories && !isMemoriesLoading) {
      void loadMemories();
    }
  }, [hasLoadedMemories, isMemoriesLoading, isMemoriesOpen, loadMemories]);

  const toggleHeartbeatsSection = useCallback(() => {
    const nextIsOpen = !isHeartbeatsOpen;
    dispatchUi({ type: "set", payload: { isHeartbeatsOpen: nextIsOpen } });
    if (nextIsOpen && !hasLoadedHeartbeats && !isHeartbeatsLoading) {
      void loadHeartbeats();
    }
  }, [hasLoadedHeartbeats, isHeartbeatsLoading, isHeartbeatsOpen, loadHeartbeats]);

  const handleBan = async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      await banAdminUser<{ success: boolean }>(username, banReason || undefined);
      toast.success(t("apps.admin.messages.userBanned", { username }));
      dispatchUi({
        type: "set",
        payload: { showBanInput: false, banReason: "" },
      });
      fetchProfile();
    } catch (error) {
      console.error("Failed to ban user:", error);
      if (error instanceof ApiRequestError && error.message) {
        toast.error(error.message);
      } else {
      toast.error(t("apps.admin.errors.failedToBanUser"));
      }
    }
    setIsBanDialogOpen(false);
  };

  const handleUnban = async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      await unbanAdminUser<{ success: boolean }>(username);
      toast.success(t("apps.admin.messages.userUnbanned", { username }));
      fetchProfile();
    } catch (error) {
      console.error("Failed to unban user:", error);
      if (error instanceof ApiRequestError && error.message) {
        toast.error(error.message);
      } else {
        toast.error(t("apps.admin.errors.failedToUnbanUser"));
      }
    }
  };

  const handleDelete = async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      await deleteAdminUser<{ success: boolean }>(username);
      toast.success(t("apps.admin.messages.userDeleted", { username }));
      onUserDeleted();
      onBack();
    } catch (error) {
      console.error("Failed to delete user:", error);
      if (error instanceof ApiRequestError && error.message) {
        toast.error(error.message);
      } else {
        toast.error(t("apps.admin.errors.failedToDeleteUser"));
      }
    }
    setIsDeleteDialogOpen(false);
  };

  const handleClearMemory = async () => {
    if (!currentUser || !isAuthenticated) return;
    setIsClearingMemory(true);
    try {
      const data = await clearAdminUserMemories<{ message?: string }>(username);
      toast.success(data.message || t("apps.admin.profile.memoriesCleared"));
      fetchMemories();
    } catch (error) {
      console.error("Failed to clear memories:", error);
      if (error instanceof ApiRequestError && error.message) {
        toast.error(error.message);
      } else {
        toast.error(t("apps.admin.errors.failedToClearMemories"));
      }
    } finally {
      setIsClearingMemory(false);
      setIsClearMemoryDialogOpen(false);
    }
  };

  const handleForceProcessDailyNotes = async () => {
    if (!currentUser || !isAuthenticated) return;
    setIsProcessingNotes(true);
    try {
      const data = await forceAdminDailyNotes<{ message?: string }>(username);
      toast.success(data.message || t("apps.admin.profile.dailyNotesProcessed"));
      fetchMemories();
    } catch (error) {
      console.error("Failed to process daily notes:", error);
      if (error instanceof ApiRequestError && error.message) {
        toast.error(error.message);
      } else {
        toast.error(t("apps.admin.errors.failedToProcessDailyNotes"));
      }
    } finally {
      setIsProcessingNotes(false);
      setIsForceProcessDialogOpen(false);
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

  
  const dispatchProfileUi = dispatchUi;

  return {
    t,
    username,
    onBack,
    profile,
    messages,
    memories,
    dailyNotes,
    heartbeats,
    isLoading,
    expandedMemories,
    expandedDailyNotes,
    expandedHeartbeats,
    banReason,
    showBanInput,
    isRoomsOpen,
    isMessagesOpen,
    isMemoriesOpen,
    isHeartbeatsOpen,
    hasLoadedMessages,
    hasLoadedMemories,
    hasLoadedHeartbeats,
    isMessagesLoading,
    isMemoriesLoading,
    isHeartbeatsLoading,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isBanDialogOpen,
    setIsBanDialogOpen,
    isClearMemoryDialogOpen,
    setIsClearMemoryDialogOpen,
    isForceProcessDialogOpen,
    setIsForceProcessDialogOpen,
    isClearingMemory,
    isProcessingNotes,
    dispatchProfileUi,
    toggleMemory,
    toggleDailyNote,
    toggleHeartbeat,
    toggleMessagesSection,
    toggleMemoriesSection,
    toggleHeartbeatsSection,
    handleBan,
    handleUnban,
    handleDelete,
    handleClearMemory,
    handleForceProcessDailyNotes,
    formatRelativeTime,
    formatDate,
    isTargetAdmin,
    roomsCount,
    messagesCount,
  };
}

export type UserProfilePanelViewModel = ReturnType<typeof useUserProfilePanel>;
