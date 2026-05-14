import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, Prohibit, Check, Trash, Warning, CaretRight, Eraser, ArrowsClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  adminAquaIconButtonClass,
  AQUA_ICON_BUTTON_ICON_CLASS,
  AQUA_ICON_BUTTON_ICON_CLASS_SM,
} from "@/lib/aquaIconButton";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
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

const RECENT_MESSAGES_LIMIT = 50;
const HEARTBEAT_LOOKBACK_DAYS = 7;

interface UserProfile {
  username: string;
  lastActive: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
  messageCount?: number;
  rooms?: { id: string; name: string }[];
}

interface UserMessage {
  id: string;
  roomId: string;
  roomName?: string;
  content: string;
  timestamp: number;
}

interface UserMemory {
  key: string;
  summary: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface DailyNoteEntry {
  timestamp: number;
  content: string;
}

interface DailyNote {
  date: string;
  entries: DailyNoteEntry[];
  processedForMemories: boolean;
  updatedAt: number;
}

interface HeartbeatRecord {
  id: string;
  timestamp: number;
  isoTimestamp?: string;
  localDate?: string;
  localTime?: string;
  timeZone?: string;
  shouldSend: boolean;
  topic: string;
  message: string | null;
  skipReason: string | null;
  stateSummary: string;
}

interface UserProfilePanelProps {
  username: string;
  onBack: () => void;
  onUserDeleted: () => void;
}

const SECTION_HEADER_CLASS = "!text-[11px] uppercase tracking-wide text-black/50";

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("bg-neutral-200 animate-pulse rounded", className)} />
);

interface SectionHeaderProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  isOpen?: boolean;
  showCaret?: boolean;
  className?: string;
}

const SectionHeader = ({
  children,
  icon,
  onClick,
  isOpen,
  showCaret,
  className,
}: SectionHeaderProps) => {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-expanded={onClick ? isOpen : undefined}
      className={cn(
        SECTION_HEADER_CLASS,
        onClick && "flex items-center gap-1.5 text-left",
        className
      )}
    >
      {showCaret && (
        <CaretRight
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
          weight="bold"
        />
      )}
      {icon}
      <span>{children}</span>
    </Component>
  );
};

export const UserProfilePanel: React.FC<UserProfilePanelProps> = ({
  username,
  onBack,
  onUserDeleted,
}) => {
  const { t } = useTranslation();
  const { username: currentUser, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [dailyNotes, setDailyNotes] = useState<DailyNote[]>([]);
  const [heartbeats, setHeartbeats] = useState<HeartbeatRecord[]>([]);
  const [expandedMemories, setExpandedMemories] = useState<Set<string>>(new Set());
  const [expandedDailyNotes, setExpandedDailyNotes] = useState<Set<string>>(new Set());
  const [expandedHeartbeats, setExpandedHeartbeats] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [banReason, setBanReason] = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);
  const [isRoomsOpen, setIsRoomsOpen] = useState(false);
  const [isMessagesOpen, setIsMessagesOpen] = useState(false);
  const [isMemoriesOpen, setIsMemoriesOpen] = useState(false);
  const [isHeartbeatsOpen, setIsHeartbeatsOpen] = useState(false);
  const [hasLoadedMessages, setHasLoadedMessages] = useState(false);
  const [hasLoadedMemories, setHasLoadedMemories] = useState(false);
  const [hasLoadedHeartbeats, setHasLoadedHeartbeats] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isMemoriesLoading, setIsMemoriesLoading] = useState(false);
  const [isHeartbeatsLoading, setIsHeartbeatsLoading] = useState(false);
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
    setExpandedMemories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleDailyNote = useCallback((date: string) => {
    setExpandedDailyNotes((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const toggleHeartbeat = useCallback((id: string) => {
    setExpandedHeartbeats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setProfile(null);
    setMessages([]);
    setMemories([]);
    setDailyNotes([]);
    setHeartbeats([]);
    setExpandedMemories(new Set());
    setExpandedDailyNotes(new Set());
    setExpandedHeartbeats(new Set());
    setShowBanInput(false);
    setBanReason("");
    setIsRoomsOpen(false);
    setIsMessagesOpen(false);
    setIsMemoriesOpen(false);
    setIsHeartbeatsOpen(false);
    setHasLoadedMessages(false);
    setHasLoadedMemories(false);
    setHasLoadedHeartbeats(false);
    setIsMessagesLoading(false);
    setIsMemoriesLoading(false);
    setIsHeartbeatsLoading(false);
    setIsLoading(true);
    fetchProfile().finally(() => {
      setIsLoading(false);
    });
  }, [fetchProfile]);

  const loadMessages = useCallback(async () => {
    if (hasLoadedMessages || isMessagesLoading) return;
    setIsMessagesLoading(true);
    try {
      const didLoad = await fetchMessages();
      if (didLoad) {
        setHasLoadedMessages(true);
      }
    } finally {
      setIsMessagesLoading(false);
    }
  }, [fetchMessages, hasLoadedMessages, isMessagesLoading]);

  const loadMemories = useCallback(async () => {
    if (hasLoadedMemories || isMemoriesLoading) return;
    setIsMemoriesLoading(true);
    try {
      const didLoad = await fetchMemories();
      if (didLoad) {
        setHasLoadedMemories(true);
      }
    } finally {
      setIsMemoriesLoading(false);
    }
  }, [fetchMemories, hasLoadedMemories, isMemoriesLoading]);

  const loadHeartbeats = useCallback(async () => {
    if (hasLoadedHeartbeats || isHeartbeatsLoading) return;
    setIsHeartbeatsLoading(true);
    try {
      const didLoad = await fetchHeartbeats();
      if (didLoad) {
        setHasLoadedHeartbeats(true);
      }
    } finally {
      setIsHeartbeatsLoading(false);
    }
  }, [fetchHeartbeats, hasLoadedHeartbeats, isHeartbeatsLoading]);

  const toggleMessagesSection = useCallback(() => {
    const nextIsOpen = !isMessagesOpen;
    setIsMessagesOpen(nextIsOpen);
    if (nextIsOpen && !hasLoadedMessages && !isMessagesLoading) {
      void loadMessages();
    }
  }, [hasLoadedMessages, isMessagesLoading, isMessagesOpen, loadMessages]);

  const toggleMemoriesSection = useCallback(() => {
    const nextIsOpen = !isMemoriesOpen;
    setIsMemoriesOpen(nextIsOpen);
    if (nextIsOpen && !hasLoadedMemories && !isMemoriesLoading) {
      void loadMemories();
    }
  }, [hasLoadedMemories, isMemoriesLoading, isMemoriesOpen, loadMemories]);

  const toggleHeartbeatsSection = useCallback(() => {
    const nextIsOpen = !isHeartbeatsOpen;
    setIsHeartbeatsOpen(nextIsOpen);
    if (nextIsOpen && !hasLoadedHeartbeats && !isHeartbeatsLoading) {
      void loadHeartbeats();
    }
  }, [hasLoadedHeartbeats, isHeartbeatsLoading, isHeartbeatsOpen, loadHeartbeats]);

  const handleBan = async () => {
    if (!currentUser || !isAuthenticated) return;
    try {
      await banAdminUser<{ success: boolean }>(username, banReason || undefined);
      toast.success(t("apps.admin.messages.userBanned", { username }));
      setShowBanInput(false);
      setBanReason("");
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

  if (!isLoading && !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Warning className="h-8 w-8 text-neutral-400" weight="bold" />
        <span className="text-[11px] text-neutral-500">{t("apps.admin.profile.notFound")}</span>
        <Button variant="ghost" size="sm" onClick={onBack} className="text-[11px]">
          <ArrowLeft className="h-3 w-3 mr-1" weight="bold" />
          {t("apps.admin.profile.back")}
        </Button>
      </div>
    );
  }

  const isTargetAdmin = username.toLowerCase() === "ryo";
  const roomsCount = profile?.rooms?.length ?? 0;
  const messagesCount = hasLoadedMessages
    ? messages.length
    : Math.min(profile?.messageCount ?? 0, RECENT_MESSAGES_LIMIT);

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
          <ArrowLeft className="h-3.5 w-3.5" weight="bold" />
        </Button>
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-neutral-600",
            isLoading ? "bg-neutral-200 animate-pulse" : "bg-neutral-200"
          )}>
            {!isLoading && username[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              {isLoading ? (
                <Skeleton className="h-4 w-24" />
              ) : (
                <>
                  <span className="text-[12px] font-medium">{profile?.username || username}</span>
                  {profile?.banned && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded">
                      {t("apps.admin.profile.banned")}
                    </span>
                  )}
                  {isTargetAdmin && (
                    <span className="px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded">
                      {t("apps.admin.user.admin")}
                    </span>
                  )}
                </>
              )}
            </div>
            {isLoading ? (
              <Skeleton className="h-3 w-32 mt-1" />
            ) : (
              <span className="text-[10px] text-neutral-500">
                {t("apps.admin.profile.lastActive")}: {formatRelativeTime(profile?.lastActive || 0)}
              </span>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="py-1.5">
              <SectionHeader className="mb-1">
                {t("apps.admin.profile.messages")}
              </SectionHeader>
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-[14px] font-medium">{profile?.messageCount || 0}</span>
              )}
            </div>
            <div className="py-1.5">
              <SectionHeader className="mb-1">
                {t("apps.admin.profile.rooms")}
              </SectionHeader>
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-[14px] font-medium">{profile?.rooms?.length || 0}</span>
              )}
            </div>
          </div>

          {/* Ban Info */}
          {!isLoading && profile?.banned && (
            <div className="p-2 bg-red-50 rounded border border-red-200">
              <SectionHeader
                className="flex items-start gap-1.5 text-red-600 mb-1"
                icon={<Prohibit className="h-3 w-3 mt-px" weight="bold" />}
              >
                {t("apps.admin.profile.banDetails")}
              </SectionHeader>
              <div className="text-[11px] space-y-1">
                <div>
                  <span className="text-neutral-500">{t("apps.admin.profile.reason")}:</span>{" "}
                  {profile.banReason || t("apps.admin.profile.noReason")}
                </div>
                {profile.bannedAt && (
                  <div>
                    <span className="text-neutral-500">{t("apps.admin.profile.bannedOn")}:</span>{" "}
                    {formatDate(profile.bannedAt)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {!isTargetAdmin && (
            <div className="space-y-2">
              <SectionHeader>{t("apps.admin.profile.actions")}</SectionHeader>
              {isLoading ? (
                <div className="flex gap-2">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-7 w-24" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile?.banned ? (
                    <button
                      onClick={handleUnban}
                      className={adminAquaIconButtonClass("primary")}
                    >
                      <Check className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
                      <span>{t("apps.admin.profile.unban")}</span>
                    </button>
                  ) : (
                    <>
                      {showBanInput ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            placeholder={t("apps.admin.profile.banReasonPlaceholder")}
                            value={banReason}
                            onChange={(e) => setBanReason(e.target.value)}
                            className="h-7 text-[11px] flex-1"
                          />
                          <button
                            onClick={() => setIsBanDialogOpen(true)}
                            className="aqua-button orange h-7 px-3 text-[11px]"
                            style={{ color: "#000", textShadow: "none" }}
                          >
                            <span style={{ color: "#000" }}>{t("apps.admin.profile.confirmBan")}</span>
                          </button>
                          <button
                            onClick={() => {
                              setShowBanInput(false);
                              setBanReason("");
                            }}
                            className="aqua-button secondary h-7 px-3 text-[11px]"
                          >
                            <span>{t("common.dialog.cancel")}</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowBanInput(true)}
                          className={adminAquaIconButtonClass("orange")}
                          style={{ color: "#000", textShadow: "none" }}
                        >
                          <Prohibit
                            className={AQUA_ICON_BUTTON_ICON_CLASS}
                            style={{ color: "#000" }}
                            weight="bold"
                          />
                          <span style={{ color: "#000" }}>{t("apps.admin.profile.ban")}</span>
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className={adminAquaIconButtonClass("secondary")}
                  >
                    <Trash className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
                    <span>{t("apps.admin.profile.delete")}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Long-Term Memories */}
          {isLoading ? (
            <div className="space-y-2">
              <SectionHeader>{t("apps.admin.profile.longTermMemories")}</SectionHeader>
              <div className="space-y-1">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <SectionHeader
                onClick={toggleMemoriesSection}
                isOpen={isMemoriesOpen}
                showCaret={true}
              >
                {t("apps.admin.profile.longTermMemories")}
                {hasLoadedMemories ? ` (${memories.length})` : ""}
              </SectionHeader>
              {isMemoriesOpen && (
                <>
                  {isMemoriesLoading ? (
                    <div className="space-y-1">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ) : (
                    <>
                      {memories.length > 0 && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => setIsClearMemoryDialogOpen(true)}
                            disabled={isClearingMemory}
                            className={cn(
                              adminAquaIconButtonClass("secondary", "sm"),
                              "disabled:opacity-50"
                            )}
                          >
                            <Eraser className={AQUA_ICON_BUTTON_ICON_CLASS_SM} weight="bold" />
                            <span>{isClearingMemory ? t("apps.admin.profile.clearing") : t("apps.admin.profile.clearAll")}</span>
                          </button>
                        </div>
                      )}
                      {memories.length === 0 ? (
                        <div className="text-[11px] text-neutral-400 text-center py-4">
                          {t("apps.admin.profile.noMemories")}
                        </div>
                      ) : (
                        <Table className="table-fixed">
                          <TableHeader>
                            <TableRow className="text-[10px] border-none font-normal">
                              <TableHead className="font-normal bg-gray-100/50 h-[24px] w-[30%]">
                                {t("apps.admin.profile.memoryKey")}
                              </TableHead>
                              <TableHead className="font-normal bg-gray-100/50 h-[24px]">
                                {t("apps.admin.profile.memorySummary")}
                              </TableHead>
                              <TableHead className="font-normal bg-gray-100/50 h-[24px] whitespace-nowrap w-[20%]">
                                {t("apps.admin.tableHeaders.time")}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="text-[11px]">
                            {memories.map((memory, index) => {
                              const isExpanded = expandedMemories.has(memory.key);
                              return (
                                <React.Fragment key={memory.key}>
                                  <TableRow
                                    onClick={() => toggleMemory(memory.key)}
                                    className={cn(
                                      "border-none hover:bg-gray-100/50 transition-colors cursor-pointer",
                                      index % 2 === 1 && "bg-gray-200/30"
                                    )}
                                  >
                                    <TableCell>
                                      <span className="text-purple-700 font-medium break-all">{memory.key}</span>
                                      <CaretRight
                                        className={cn(
                                          "h-3 w-3 inline-block ml-1 text-neutral-400 transition-transform",
                                          isExpanded && "rotate-90"
                                        )}
                                        weight="bold"
                                      />
                                    </TableCell>
                                    <TableCell className="min-w-0">
                                      <span className="line-clamp-2 break-words text-neutral-500">{memory.summary}</span>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap text-neutral-500">
                                      {formatRelativeTime(memory.updatedAt)}
                                    </TableCell>
                                  </TableRow>
                                  {isExpanded && (
                                    <TableRow
                                      className={cn(
                                        "border-none",
                                        index % 2 === 1 ? "bg-gray-200/30" : ""
                                      )}
                                    >
                                      <TableCell colSpan={3} className="pt-0 pb-3">
                                        <div className="pl-2 border-l-2 border-purple-200">
                                          <p className="text-[11px] whitespace-pre-wrap text-neutral-700">
                                            {memory.content}
                                          </p>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                      {dailyNotes.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <SectionHeader>
                              {t("apps.admin.profile.dailyNotes")} ({dailyNotes.reduce((acc, n) => acc + n.entries.length, 0)} {t("apps.admin.profile.entries")})
                            </SectionHeader>
                            <button
                              onClick={() => setIsForceProcessDialogOpen(true)}
                              disabled={isProcessingNotes}
                              className={cn(
                                adminAquaIconButtonClass("secondary", "sm"),
                                "disabled:opacity-50"
                              )}
                            >
                              <ArrowsClockwise
                                className={cn(
                                  AQUA_ICON_BUTTON_ICON_CLASS_SM,
                                  isProcessingNotes && "animate-spin"
                                )}
                                weight="bold"
                              />
                              <span>{isProcessingNotes ? t("apps.admin.profile.processing") : t("apps.admin.profile.reprocess")}</span>
                            </button>
                          </div>
                          <div className="space-y-1">
                            {dailyNotes.map((note) => {
                              const isExpanded = expandedDailyNotes.has(note.date);
                              const now = new Date();
                              const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
                              const dateLabel = note.date === today ? `${note.date} (${t("apps.admin.profile.today")})` : note.date;
                              return (
                                <div key={note.date}>
                                  <button
                                    onClick={() => toggleDailyNote(note.date)}
                                    className="flex items-center gap-1.5 w-full text-left text-[11px] hover:bg-gray-100/50 px-1 py-0.5 rounded transition-colors"
                                  >
                                    <CaretRight
                                      className={cn(
                                        "h-3 w-3 text-neutral-400 transition-transform flex-shrink-0",
                                        isExpanded && "rotate-90"
                                      )}
                                      weight="bold"
                                    />
                                    <span className="text-amber-700 font-medium">{dateLabel}</span>
                                    <span className="text-neutral-400 ml-1">
                                      ({note.entries.length} {t("apps.admin.profile.entries")})
                                      {note.processedForMemories ? (
                                        <span className="text-green-600 ml-1" title={t("apps.admin.profile.processedTooltip")}>✓ {t("apps.admin.profile.processed")}</span>
                                      ) : (
                                        <span className="text-amber-500 ml-1" title={t("apps.admin.profile.pendingTooltip")}>○ {t("apps.admin.profile.pending")}</span>
                                      )}
                                    </span>
                                  </button>
                                  {isExpanded && (
                                    <div className="pl-5 mt-1 space-y-1">
                                      {note.entries.map((entry, i) => {
                                        const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
                                          hour: "numeric",
                                          minute: "2-digit",
                                          hour12: true,
                                        });
                                        return (
                                          <div key={i} className="text-[11px] flex gap-2">
                                            <span className="text-neutral-400 whitespace-nowrap flex-shrink-0">{time}</span>
                                            <span className="text-neutral-600">{entry.content}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Heartbeat Records */}
          {!isLoading && (() => {
            const sentCount = heartbeats.filter(h => h.shouldSend).length;
            const skippedCount = heartbeats.length - sentCount;
            const reversedHeartbeats = [...heartbeats].reverse();
            return (
              <div className="space-y-2">
                <SectionHeader
                  onClick={toggleHeartbeatsSection}
                  isOpen={isHeartbeatsOpen}
                  showCaret={true}
                >
                  {t("apps.admin.profile.heartbeats")}
                  {hasLoadedHeartbeats ? ` (${heartbeats.length})` : ""}
                </SectionHeader>
                {isHeartbeatsOpen && (
                  <>
                    {isHeartbeatsLoading ? (
                      <div className="space-y-1">
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-6 w-full" />
                      </div>
                    ) : (
                      <>
                        <div className="text-[10px] text-neutral-400">
                          {sentCount} {t("apps.admin.profile.heartbeatSent")}, {skippedCount} {t("apps.admin.profile.heartbeatSkipped")}
                        </div>
                        {heartbeats.length > 0 && (
                          <Table className="table-fixed">
                            <TableHeader>
                              <TableRow className="text-[10px] border-none font-normal">
                                <TableHead className="font-normal bg-gray-100/50 h-[24px] w-[22%]">
                                  {t("apps.admin.tableHeaders.status")}
                                </TableHead>
                                <TableHead className="font-normal bg-gray-100/50 h-[24px]">
                                  {t("apps.admin.tableHeaders.message")}
                                </TableHead>
                                <TableHead className="font-normal bg-gray-100/50 h-[24px] whitespace-nowrap w-[25%]">
                                  {t("apps.admin.tableHeaders.time")}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className="text-[11px]">
                              {reversedHeartbeats.map((hb, index) => {
                                const isExpanded = expandedHeartbeats.has(hb.id);
                                return (
                                  <React.Fragment key={hb.id}>
                                    <TableRow
                                      onClick={() => toggleHeartbeat(hb.id)}
                                      className={cn(
                                        "border-none hover:bg-gray-100/50 transition-colors cursor-pointer",
                                        index % 2 === 1 && "bg-gray-200/30"
                                      )}
                                    >
                                      <TableCell className="whitespace-nowrap">
                                        <span className={cn(
                                          "font-medium",
                                          hb.shouldSend ? "text-green-700" : "text-neutral-400"
                                        )}>
                                          {hb.shouldSend ? "sent" : "skipped"}
                                        </span>
                                        <CaretRight
                                          className={cn(
                                            "h-3 w-3 inline-block ml-1 text-neutral-400 transition-transform",
                                            isExpanded && "rotate-90"
                                          )}
                                          weight="bold"
                                        />
                                      </TableCell>
                                      <TableCell className="min-w-0">
                                        <span className="line-clamp-2 break-words text-neutral-500">
                                          {hb.shouldSend
                                            ? (hb.message || "heartbeat sent")
                                            : (hb.skipReason || "—")}
                                        </span>
                                      </TableCell>
                                      <TableCell className="whitespace-nowrap text-neutral-500">
                                        {formatRelativeTime(hb.timestamp)}
                                      </TableCell>
                                    </TableRow>
                                    {isExpanded && (
                                      <TableRow
                                        className={cn(
                                          "border-none",
                                          index % 2 === 1 ? "bg-gray-200/30" : ""
                                        )}
                                      >
                                        <TableCell colSpan={3} className="pt-0 pb-3">
                                          <div className="pl-2 border-l-2 border-green-200 space-y-1">
                                            {hb.message && (
                                              <p className="text-[11px] whitespace-pre-wrap text-neutral-700">
                                                {hb.message}
                                              </p>
                                            )}
                                            {hb.skipReason && (
                                              <div className="text-[11px]">
                                                <span className="text-neutral-400">{t("apps.admin.profile.reason")}:</span>{" "}
                                                <span className="text-neutral-600">{hb.skipReason}</span>
                                              </div>
                                            )}
                                            <div className="text-[10px] text-neutral-400 font-mono break-all">
                                              {hb.stateSummary}
                                            </div>
                                            {(hb.localDate || hb.isoTimestamp) && (
                                              <div className="text-[10px] text-neutral-400">
                                                {hb.localDate
                                                  ? `${hb.localDate} ${hb.localTime || ""}${hb.timeZone ? ` (${hb.timeZone})` : ""}`
                                                  : new Date(hb.timestamp).toLocaleString()}
                                              </div>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </TableBody>
                          </Table>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* Rooms */}
          {isLoading ? (
            <div className="space-y-2">
              <SectionHeader>{t("apps.admin.profile.activeRooms")}</SectionHeader>
              <div className="flex gap-1">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <SectionHeader
                onClick={() => setIsRoomsOpen((prev) => !prev)}
                isOpen={isRoomsOpen}
                showCaret={true}
              >
                {t("apps.admin.profile.activeRooms")} ({roomsCount})
              </SectionHeader>
              {isRoomsOpen && (
                <>
                  {roomsCount > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {profile?.rooms?.map((room) => (
                        <span
                          key={room.id}
                          className="px-2 py-1 text-[10px] bg-gray-100 rounded"
                        >
                          #{room.name}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Recent Messages */}
          {isLoading ? (
            <div className="space-y-2">
              <SectionHeader>{t("apps.admin.profile.recentMessages")}</SectionHeader>
              <div className="space-y-1">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <SectionHeader
                onClick={toggleMessagesSection}
                isOpen={isMessagesOpen}
                showCaret={true}
              >
                {t("apps.admin.profile.recentMessages")} ({messagesCount})
              </SectionHeader>
              {isMessagesOpen && (
                <>
                  {isMessagesLoading ? (
                    <div className="space-y-1">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ) : messagesCount === 0 ? (
                    <div className="text-[11px] text-neutral-400 text-center py-4">
                      {t("apps.admin.profile.noMessages")}
                    </div>
                  ) : (
                    <Table className="table-fixed">
                      <TableHeader>
                        <TableRow className="text-[10px] border-none font-normal">
                          <TableHead className="font-normal bg-gray-100/50 h-[24px] w-[25%]">
                            {t("apps.admin.profile.room")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[24px]">
                            {t("apps.admin.tableHeaders.message")}
                          </TableHead>
                          <TableHead className="font-normal bg-gray-100/50 h-[24px] whitespace-nowrap w-[20%]">
                            {t("apps.admin.tableHeaders.time")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-[11px]">
                        {messages.map((message) => (
                          <TableRow
                            key={message.id}
                            className="border-none hover:bg-gray-100/50 transition-colors cursor-default odd:bg-gray-200/30"
                          >
                            <TableCell>
                              <span className="text-neutral-500">#</span>
                              <span className="break-all">{message.roomName || message.roomId}</span>
                            </TableCell>
                            <TableCell className="min-w-0">
                              <span className="line-clamp-2 break-words">{message.content}</span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-neutral-500">
                              {formatRelativeTime(message.timestamp)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        title={t("apps.admin.dialogs.deleteTitle", { type: t("apps.admin.user.user") })}
        description={t("apps.admin.dialogs.deleteDescription", {
          type: t("apps.admin.user.user"),
          name: username,
        })}
      />
      <ConfirmDialog
        isOpen={isBanDialogOpen}
        onOpenChange={setIsBanDialogOpen}
        onConfirm={handleBan}
        title={t("apps.admin.dialogs.banTitle")}
        description={t("apps.admin.dialogs.banDescription", { username })}
      />
      <ConfirmDialog
        isOpen={isClearMemoryDialogOpen}
        onOpenChange={setIsClearMemoryDialogOpen}
        onConfirm={handleClearMemory}
        title={t("apps.admin.dialogs.clearMemoriesTitle")}
        description={t("apps.admin.dialogs.clearMemoriesDescription", { count: memories.length, username })}
      />
      <ConfirmDialog
        isOpen={isForceProcessDialogOpen}
        onOpenChange={setIsForceProcessDialogOpen}
        onConfirm={handleForceProcessDailyNotes}
        title={t("apps.admin.dialogs.reprocessDailyNotesTitle")}
        description={t("apps.admin.dialogs.reprocessDailyNotesDescription", { username })}
      />
    </div>
  );
};
