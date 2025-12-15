import { useState, useEffect, useCallback, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AdminMenuBar } from "./AdminMenuBar";
import { AdminSidebar } from "./AdminSidebar";
import { UserProfilePanel } from "./UserProfilePanel";
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
import { Search, Trash2, RefreshCw, AlertTriangle, Ban } from "lucide-react";
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
  const [visibleUsersCount, setVisibleUsersCount] = useState(20);
  const USERS_PER_PAGE = 20;
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    totalRooms: 0,
    totalMessages: 0,
  });

  const [activeSection, setActiveSection] = useState<AdminSection>("users");
  const [isRoomsExpanded, setIsRoomsExpanded] = useState(true);
  const [selectedUserProfile, setSelectedUserProfile] = useState<string | null>(null);

  // Sidebar visibility and mobile detection
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFrameNarrow, setIsFrameNarrow] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

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

  // Fetch users (uses admin API to get all users)
  const fetchUsers = useCallback(async (search: string = "") => {
    if (!username || !authToken) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin?action=getAllUsers`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "x-username": username,
        },
      });
      const data = await response.json();
      // Sort users: banned first, then alphabetically by username
      let sortedUsers = (data.users || []).sort((a: User, b: User) => {
        // Banned users first
        if (a.banned && !b.banned) return -1;
        if (!a.banned && b.banned) return 1;
        // Then alphabetically
        return a.username.toLowerCase().localeCompare(b.username.toLowerCase());
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
  }, [username, authToken, t, USERS_PER_PAGE]);

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
    fetchRooms();
    fetchStats();
    if (selectedRoomId) {
      fetchRoomMessages(selectedRoomId);
    }
    fetchUsers(userSearch);
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
            {!selectedUserProfile && (
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
                      #{" "}
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
                    className="h-7 w-7 p-0 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
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
                                onClick={() =>
                                  promptDelete(
                                    "message",
                                    message.id,
                                    message.content.substring(0, 30) + "..."
                                  )
                                }
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
