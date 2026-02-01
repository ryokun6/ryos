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
import { ArrowLeft, Prohibit, Check, Trash, ChatCircle, Hash, Warning, CaretRight, Brain } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";

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

interface UserProfilePanelProps {
  username: string;
  onBack: () => void;
  onUserDeleted: () => void;
}

export const UserProfilePanel: React.FC<UserProfilePanelProps> = ({
  username,
  onBack,
  onUserDeleted,
}) => {
  const { t } = useTranslation();
  const { username: currentUser, authToken } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [expandedMemories, setExpandedMemories] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [banReason, setBanReason] = useState("");
  const [showBanInput, setShowBanInput] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBanDialogOpen, setIsBanDialogOpen] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!currentUser || !authToken) return;
    try {
      const response = await fetch(
        `/api/admin?action=getUserProfile&username=${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": currentUser,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      toast.error(t("apps.admin.errors.failedToFetchProfile"));
    }
  }, [username, authToken, currentUser, t]);

  const fetchMessages = useCallback(async () => {
    if (!currentUser || !authToken) return;
    try {
      const response = await fetch(
        `/api/admin?action=getUserMessages&username=${encodeURIComponent(username)}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": currentUser,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Failed to fetch messages:", error);
    }
  }, [username, authToken, currentUser]);

  const fetchMemories = useCallback(async () => {
    if (!currentUser || !authToken) return;
    try {
      const response = await fetch(
        `/api/admin?action=getUserMemories&username=${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            "x-username": currentUser,
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories || []);
      }
    } catch (error) {
      console.error("Failed to fetch memories:", error);
    }
  }, [username, authToken, currentUser]);

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

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchProfile(), fetchMessages(), fetchMemories()]).finally(() => {
      setIsLoading(false);
    });
  }, [fetchProfile, fetchMessages, fetchMemories]);

  const handleBan = async () => {
    if (!currentUser || !authToken) return;
    try {
      const response = await fetch(`/api/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "x-username": currentUser,
        },
        body: JSON.stringify({
          action: "banUser",
          targetUsername: username,
          reason: banReason || undefined,
        }),
      });

      if (response.ok) {
        toast.success(t("apps.admin.messages.userBanned", { username }));
        setShowBanInput(false);
        setBanReason("");
        fetchProfile();
      } else {
        const data = await response.json();
        toast.error(data.error || t("apps.admin.errors.failedToBanUser"));
      }
    } catch (error) {
      console.error("Failed to ban user:", error);
      toast.error(t("apps.admin.errors.failedToBanUser"));
    }
    setIsBanDialogOpen(false);
  };

  const handleUnban = async () => {
    if (!currentUser || !authToken) return;
    try {
      const response = await fetch(`/api/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "x-username": currentUser,
        },
        body: JSON.stringify({
          action: "unbanUser",
          targetUsername: username,
        }),
      });

      if (response.ok) {
        toast.success(t("apps.admin.messages.userUnbanned", { username }));
        fetchProfile();
      } else {
        const data = await response.json();
        toast.error(data.error || t("apps.admin.errors.failedToUnbanUser"));
      }
    } catch (error) {
      console.error("Failed to unban user:", error);
      toast.error(t("apps.admin.errors.failedToUnbanUser"));
    }
  };

  const handleDelete = async () => {
    if (!currentUser || !authToken) return;
    try {
      const response = await fetch(`/api/admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "x-username": currentUser,
        },
        body: JSON.stringify({
          action: "deleteUser",
          targetUsername: username,
        }),
      });

      if (response.ok) {
        toast.success(t("apps.admin.messages.userDeleted", { username }));
        onUserDeleted();
        onBack();
      } else {
        const data = await response.json();
        toast.error(data.error || t("apps.admin.errors.failedToDeleteUser"));
      }
    } catch (error) {
      console.error("Failed to delete user:", error);
      toast.error(t("apps.admin.errors.failedToDeleteUser"));
    }
    setIsDeleteDialogOpen(false);
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

  // Skeleton placeholder component
  const Skeleton = ({ className }: { className?: string }) => (
    <div className={cn("bg-neutral-200 animate-pulse rounded", className)} />
  );

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
              <div className="flex items-start gap-1.5 text-[10px] text-neutral-500 mb-1">
                <ChatCircle className="h-3 w-3 mt-px" weight="bold" />
                {t("apps.admin.profile.messages")}
              </div>
              {isLoading ? (
                <Skeleton className="h-5 w-8" />
              ) : (
                <span className="text-[14px] font-medium">{profile?.messageCount || 0}</span>
              )}
            </div>
            <div className="py-1.5">
              <div className="flex items-start gap-1.5 text-[10px] text-neutral-500 mb-1">
                <Hash className="h-3 w-3 mt-px" weight="bold" />
                {t("apps.admin.profile.rooms")}
              </div>
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
              <div className="flex items-start gap-1.5 text-[10px] text-red-600 mb-1">
                <Prohibit className="h-3 w-3 mt-px" weight="bold" />
                {t("apps.admin.profile.banDetails")}
              </div>
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
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.profile.actions")}
              </div>
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
                      className="aqua-button primary h-7 px-3 text-[11px] flex items-center gap-1"
                    >
                      <Check className="h-3 w-3" weight="bold" />
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
                          className="aqua-button orange h-7 px-3 text-[11px] flex items-center gap-1"
                          style={{ color: "#000", textShadow: "none" }}
                        >
                          <Prohibit className="h-3 w-3" style={{ color: "#000" }} weight="bold" />
                          <span style={{ color: "#000" }}>{t("apps.admin.profile.ban")}</span>
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="aqua-button secondary h-7 px-3 text-[11px] flex items-center gap-1"
                  >
                    <Trash className="h-3 w-3" weight="bold" />
                    <span>{t("apps.admin.profile.delete")}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rooms */}
          {isLoading ? (
            <div className="space-y-2">
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.profile.activeRooms")}
              </div>
              <div className="flex gap-1">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
          ) : profile?.rooms && profile.rooms.length > 0 && (
            <div className="space-y-2">
              <div className="!text-[11px] uppercase tracking-wide text-black/50">
                {t("apps.admin.profile.activeRooms")}
              </div>
              <div className="flex flex-wrap gap-1">
                {profile.rooms.map((room) => (
                  <span
                    key={room.id}
                    className="px-2 py-1 text-[10px] bg-gray-100 rounded"
                  >
                    #{room.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Memories */}
          {isLoading ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 !text-[11px] uppercase tracking-wide text-black/50">
                <Brain className="h-3 w-3" weight="bold" />
                {t("apps.admin.profile.memories")}
              </div>
              <div className="space-y-1">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 !text-[11px] uppercase tracking-wide text-black/50">
                <Brain className="h-3 w-3" weight="bold" />
                {t("apps.admin.profile.memories")} ({memories.length})
              </div>
              {memories.length === 0 ? (
                <div className="text-[11px] text-neutral-400 text-center py-4">
                  {t("apps.admin.profile.noMemories")}
                </div>
              ) : (
                <div className="border border-gray-200 rounded overflow-hidden">
                  {memories.map((memory, index) => {
                    const isExpanded = expandedMemories.has(memory.key);
                    return (
                      <div key={memory.key}>
                        {/* Memory row - clickable header */}
                        <div
                          onClick={() => toggleMemory(memory.key)}
                          className={cn(
                            "flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100/50 transition-colors",
                            index % 2 === 1 && "bg-gray-50"
                          )}
                        >
                          <CaretRight
                            className={cn(
                              "h-3 w-3 mt-0.5 flex-shrink-0 text-neutral-400 transition-transform",
                              isExpanded && "rotate-90"
                            )}
                            weight="bold"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-medium text-purple-700">
                              {memory.key}
                            </span>
                            <span className="text-[11px] text-neutral-400 mx-1">·</span>
                            <span className="text-[11px] text-neutral-600 line-clamp-1">
                              {memory.summary}
                            </span>
                          </div>
                        </div>
                        {/* Expanded content */}
                        {isExpanded && (
                          <div className={cn(
                            "px-7 py-2 border-t border-gray-100",
                            index % 2 === 1 ? "bg-gray-100/50" : "bg-gray-50/50"
                          )}>
                            <p className="text-[11px] whitespace-pre-wrap text-neutral-700">
                              {memory.content}
                            </p>
                            <div className="mt-2 text-[10px] text-neutral-400">
                              {t("apps.admin.profile.memoryUpdated")} {formatRelativeTime(memory.updatedAt)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recent Messages */}
          {!isLoading && (
          <div className="space-y-2">
            <div className="!text-[11px] uppercase tracking-wide text-black/50">
              {t("apps.admin.profile.recentMessages")} ({messages.length})
            </div>
            {messages.length === 0 ? (
              <div className="text-[11px] text-neutral-400 text-center py-4">
                {t("apps.admin.profile.noMessages")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px] border-none font-normal">
                    <TableHead className="font-normal bg-gray-100/50 h-[24px]">
                      {t("apps.admin.profile.room")}
                    </TableHead>
                    <TableHead className="font-normal bg-gray-100/50 h-[24px]">
                      {t("apps.admin.tableHeaders.message")}
                    </TableHead>
                    <TableHead className="font-normal bg-gray-100/50 h-[24px] whitespace-nowrap">
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
                      <TableCell className="whitespace-nowrap">
                        <span className="text-neutral-500">#</span>
                        {message.roomName || message.roomId}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="truncate block">{message.content}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-neutral-500">
                        {formatRelativeTime(message.timestamp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </div>
  );
};
