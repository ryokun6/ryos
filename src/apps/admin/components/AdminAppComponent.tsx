import { useState, useEffect, useCallback } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AdminMenuBar } from "./AdminMenuBar";
import { AdminSidebar } from "./AdminSidebar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useAuth } from "@/hooks/useAuth";
import { useThemeStore } from "@/stores/useThemeStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Trash2, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface User {
  username: string;
  lastActive: number;
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
}

type AdminSection = "users" | "rooms";

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
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "user" | "room" | "message";
    id: string;
    name: string;
  } | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomMessages, setRoomMessages] = useState<Message[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalRooms: 0,
    totalMessages: 0,
  });

  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [isRoomsExpanded, setIsRoomsExpanded] = useState(true);

  const isAdmin = username?.toLowerCase() === "ryo";
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || null;

  // Fetch stats
  const fetchStats = useCallback(async () => {
    if (!username || !authToken) return;

    try {
      const response = await fetch(`/api/admin?action=getStats`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "x-username": username,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  }, [username, authToken]);

  // Fetch users
  const fetchUsers = useCallback(async (search: string = "") => {
    if (search.length < 2) {
      setUsers([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/chat-rooms?action=getUsers&search=${encodeURIComponent(search)}`
      );
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Failed to fetch users:", error);
      toast.error(t("apps.admin.errors.failedToFetchUsers"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    if (!username || !authToken) return;

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
  }, [username, authToken, t]);

  // Fetch messages for a room
  const fetchRoomMessages = useCallback(
    async (roomId: string) => {
      if (!username || !authToken) return;

      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/chat-rooms?action=getMessages&roomId=${encodeURIComponent(roomId)}`,
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
    [username, authToken, t]
  );

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
        const response = await fetch(`/api/chat-rooms`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
          body: JSON.stringify({
            action: "deleteRoom",
            roomId,
          }),
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
        const response = await fetch(`/api/chat-rooms`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "x-username": username,
          },
          body: JSON.stringify({
            action: "deleteMessage",
            roomId,
            messageId,
          }),
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
    }
    setDeleteTarget(null);
    setIsDeleteDialogOpen(false);
  }, [deleteTarget, selectedRoomId, deleteUser, deleteRoom, deleteMessage]);

  // Prompt for delete
  const promptDelete = (
    type: "user" | "room" | "message",
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
    }
  }, [isAdmin, isWindowOpen, fetchRooms, fetchStats]);

  // Handle user search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearch.length >= 2) {
        fetchUsers(userSearch);
      } else {
        setUsers([]);
      }
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
    fetchRooms();
    fetchStats();
    if (selectedRoomId) {
      fetchRoomMessages(selectedRoomId);
    }
    if (userSearch.length >= 2) {
      fetchUsers(userSearch);
    }
    toast.success(t("apps.admin.messages.dataRefreshed"));
  }, [
    fetchRooms,
    fetchStats,
    fetchRoomMessages,
    fetchUsers,
    selectedRoomId,
    userSearch,
    t,
  ]);

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
        <div className="flex h-full w-full">
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
          />

          {/* Main Content */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Toolbar */}
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

              {selectedRoomId && selectedRoom && (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[12px] font-medium">
                    {selectedRoom.type === "private" ? "🔒" : "#"}{" "}
                    {selectedRoom.name}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {t("apps.admin.room.messagesCount", { count: roomMessages.length })}
                  </span>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 w-7 p-0"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
                />
              </Button>

              {selectedRoomId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => promptDelete("room", selectedRoomId, selectedRoom?.name || "")}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {/* Content Area */}
            <ScrollArea className="flex-1">
              {/* Users View */}
              {activeSection === "users" && !selectedRoomId && (
                <div className="p-2">
                  {users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <Search className="h-8 w-8 mb-2 opacity-50" />
                      <span className="text-[12px]">
                        {userSearch.length < 2
                          ? t("apps.admin.search.minChars")
                          : t("apps.admin.search.noResults")}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {users.map((user) => (
                        <div
                          key={user.username}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-neutral-100 group"
                        >
                          <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-[11px] font-medium text-neutral-600">
                            {user.username[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-medium truncate">
                                {user.username}
                              </span>
                              {user.username === "ryo" && (
                                <span className="text-[10px] text-neutral-500">
                                  ({t("apps.admin.user.admin")})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(user.lastActive)}
                          </div>
                          {user.username !== "ryo" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                promptDelete("user", user.username, user.username)
                              }
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Room Messages View */}
              {selectedRoomId && (
                <div className="p-2">
                  {roomMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
                      <span className="text-[12px]">{t("apps.admin.room.noMessages")}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {roomMessages.map((message) => (
                        <div
                          key={message.id}
                          className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-neutral-50 group"
                        >
                          <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center text-[10px] font-medium text-neutral-600 flex-shrink-0 mt-0.5">
                            {message.username[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] font-medium">
                                {message.username}
                              </span>
                              <span className="text-[10px] text-neutral-400">
                                {formatRelativeTime(message.timestamp)}
                              </span>
                            </div>
                            <p className="text-[12px] text-neutral-700 break-words">
                              {message.content}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              promptDelete(
                                "message",
                                message.id,
                                message.content.substring(0, 30) + "..."
                              )
                            }
                            className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Status Bar */}
            <div
              className={cn(
                "px-2 py-1 text-[10px] font-geneva-12 border-t flex items-center justify-between",
                isXpTheme
                  ? "bg-neutral-100 border-[#919b9c]"
                  : currentTheme === "macosx"
                  ? "bg-neutral-100 border-black/10"
                  : "bg-neutral-100 border-black/20"
              )}
            >
              <span>
                {activeSection === "users" && !selectedRoomId
                  ? t("apps.admin.statusBar.usersCount", { count: users.length })
                  : selectedRoomId
                  ? t("apps.admin.statusBar.messagesCount", { count: roomMessages.length })
                  : t("apps.admin.statusBar.roomsCount", { count: rooms.length })}
              </span>
              <span className="text-neutral-500">
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
