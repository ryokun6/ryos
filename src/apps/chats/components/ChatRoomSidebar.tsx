import React, { useMemo } from "react";
import { Plus, Trash, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ChatRoom } from "@/types/chat";
import { useSound, Sounds } from "@/hooks/useSound";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { useChatsStore } from "@/stores/useChatsStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { osAppSidebarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import {
  isPrivateRoomOnline,
  sortPrivateRoomsForSidebar,
} from "../utils/privateRoomOrdering";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

// Extracted ChatRoomSidebar component
interface ChatRoomSidebarProps {
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  onRoomSelect: (room: ChatRoom | null) => void;
  onAddRoom: () => void;
  onDeleteRoom?: (room: ChatRoom) => void;
  isVisible: boolean;
  isAdmin: boolean;
  isOverlay?: boolean;
  username?: string | null;
  onlineUsers?: string[];
}

const ChatRoomSidebarItem = React.memo(function ChatRoomSidebarItem({
  room,
  isSelected,
  isPrivateOnline,
  isAdmin,
  username,
  onRoomSelect,
  onDeleteRoom,
  playButtonClick,
}: {
  room: ChatRoom;
  isSelected: boolean;
  isPrivateOnline: boolean;
  isAdmin: boolean;
  username?: string | null;
  onRoomSelect: (room: ChatRoom | null) => void;
  onDeleteRoom?: (room: ChatRoom) => void;
  playButtonClick: () => void;
}) {
  const { t } = useTranslation();
  // Per-room subscription: an unread-count bump re-renders only this row.
  const unreadCount = useChatsStore((s) => s.unreadCounts[room.id] || 0);
  const hasUnread = unreadCount > 0;

  return (
    <div
      className={cn(
        "os-app-sidebar-item group relative py-1 px-5",
        isSelected ? "" : "hover:bg-black/5"
      )}
      data-selected={isSelected ? "true" : undefined}
      onClick={() => {
        playButtonClick();
        onRoomSelect(room);
      }}
    >
      <div className="flex items-center min-w-0">
        {isPrivateOnline && (
          <span
            className="inline-block size-1.5 rounded-full bg-green-500 mr-1.5 flex-shrink-0"
            title="Online"
          />
        )}
        <span className="truncate min-w-0">
          {room.type === "private"
            ? getPrivateRoomDisplayName(room, username ?? null)
            : `#${room.name}`}
        </span>
        {room.type === "irc" && (
          <span
            className={cn(
              "ml-1 text-[9px] font-bold uppercase tracking-wider flex-shrink-0",
              isSelected ? "text-white/40" : "text-black/40"
            )}
            title={`IRC ${room.ircHost || "irc.pieter.com"}`}
          >
            irc
          </span>
        )}
        {(hasUnread || room.type !== "private") && (
          <span
            className={cn(
              "text-[10px] ml-1.5 transition-opacity flex-shrink-0 whitespace-nowrap",
              hasUnread
                ? "text-orange-600"
                : isSelected
                ? "text-white/40"
                : "text-black/40",
              hasUnread || room.userCount > 0
                ? "opacity-100"
                : isSelected
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            )}
          >
            {hasUnread
              ? `${unreadCount >= 20 ? "20+" : unreadCount} ${t("apps.chats.sidebar.new")}`
              : `${room.userCount} ${t("apps.chats.sidebar.online")}`}
          </span>
        )}
      </div>
      {((isAdmin && room.type !== "private") || room.type === "private") &&
        onDeleteRoom && (
          <button
            className={cn(
              "absolute right-1 top-1/2 transform -translate-y-1/2 transition-opacity text-neutral-500 hover:text-red-500 p-1 rounded hover:bg-black/5",
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              playButtonClick();
              onDeleteRoom(room);
            }}
            aria-label={
              room.type === "private" ? t("apps.chats.ariaLabels.leaveConversation") : t("apps.chats.ariaLabels.deleteRoom")
            }
            title={
              room.type === "private" ? t("apps.chats.ariaLabels.leaveConversation") : t("apps.chats.ariaLabels.deleteRoom")
            }
          >
            <Trash className="size-3 text-black/30" weight="bold" />
          </button>
        )}
    </div>
  );
});

export const ChatRoomSidebar = React.memo(function ChatRoomSidebar({
  rooms,
  currentRoom,
  onRoomSelect,
  onAddRoom,
  onDeleteRoom,
  isVisible,
  isAdmin,
  isOverlay = false,
  username,
  onlineUsers = [],
}: ChatRoomSidebarProps) {
  const { t } = useTranslation();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const roomMessages = useChatsStore((s) => s.roomMessages);
  // NOTE: unread counts are deliberately NOT subscribed here — each
  // ChatRoomSidebarItem subscribes to its own room's count so a badge update
  // re-renders one row instead of the whole sidebar.

  // Theme detection for border styling
  const { isWindowsTheme, isMacOSTheme, isAquaGlass } = useThemeFlags();

  // Section headings are non-interactive; show all lists by default

  // Read collapse state from store BEFORE any early returns to preserve hook order
  const isChannelsOpen = useChatsStore((s) => s.isChannelsOpen);
  const isPrivateOpen = useChatsStore((s) => s.isPrivateOpen);
  const toggleChannelsOpen = useChatsStore((s) => s.toggleChannelsOpen);
  const togglePrivateOpen = useChatsStore((s) => s.togglePrivateOpen);

  const { publicRooms, privateRooms } = useMemo(() => {
    const nextPublicRooms: ChatRoom[] = [];
    const nextPrivateRooms: ChatRoom[] = [];

    for (const room of Array.isArray(rooms) ? rooms : []) {
      if (room.type === "private") {
        nextPrivateRooms.push(room);
      } else {
        nextPublicRooms.push(room);
      }
    }

    return {
      publicRooms: nextPublicRooms,
      privateRooms: sortPrivateRoomsForSidebar(nextPrivateRooms, {
        username,
        onlineUsers,
        roomMessages,
      }),
    };
  }, [onlineUsers, roomMessages, rooms, username]);

  if (!isVisible) {
    return null;
  }

  const renderRoomItem = (room: ChatRoom) => {
    // For private rooms, check if the other member(s) are online
    const isPrivateOnline = Boolean(
      room.type === "private" &&
        isPrivateRoomOnline(room, username, onlineUsers)
    );

    return (
      <ChatRoomSidebarItem
        key={room.id}
        room={room}
        isSelected={currentRoom?.id === room.id}
        isPrivateOnline={isPrivateOnline}
        isAdmin={isAdmin}
        username={username}
        onRoomSelect={onRoomSelect}
        onDeleteRoom={onDeleteRoom}
        playButtonClick={playButtonClick}
      />
    );
  };

  return (
    <div
      className={osAppSidebarSurfaceClassName(
        {
          isMacOSTheme,
          isXpTheme: isWindowsTheme,
          isWindowsTheme,
          isAquaGlass,
        },
        {
          layout: isOverlay ? "overlay" : "side",
          className: isOverlay ? "min-h-0 overflow-hidden" : undefined,
        }
      )}
    >
      <div
        className={cn(
          "pt-3 flex flex-col",
          isOverlay
            ? "min-h-0 flex-1 overflow-hidden pb-3"
            : "flex-1 overflow-hidden"
        )}
      >
        <div className="os-app-sidebar-header flex justify-between items-center mb-2 flex-shrink-0 px-3">
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-[14px] pl-1">{t("apps.chats.sidebar.chats")}</h2>
          </div>
          {username && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onAddRoom}
                    className="flex items-center text-xs hover:bg-black/5 size-[24px]"
                  >
                    <Plus className="size-3" weight="bold" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("apps.chats.ariaLabels.newChat")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div
          className={cn(
            "os-app-sidebar-list space-y-1 overscroll-contain w-full",
            isOverlay
              ? "flex-1 overflow-y-auto min-h-0"
              : "flex-1 overflow-y-auto min-h-0"
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Ryo (@ryo) Chat Selection */}
          <div
            className={cn(
              "os-app-sidebar-item py-1 px-5",
              currentRoom === null ? "" : "hover:bg-black/5"
            )}
            data-selected={currentRoom === null ? "true" : undefined}
            onClick={() => {
              playButtonClick();
              onRoomSelect(null);
            }}
          >
            {t("apps.chats.status.ryo")}
          </div>
          {/* Chat Rooms List (Sections) */}
          {Array.isArray(rooms) && (
            <>
              {(() => {
                const hasBoth =
                  publicRooms.length > 0 && privateRooms.length > 0;
                const hasPrivate = privateRooms.length > 0;
                const channelsOpen = hasPrivate ? isChannelsOpen : true;

                return (
                  <>
                    {hasBoth ? (
                      <>
                        {publicRooms.length > 0 && (
                          <div
                            className={cn(
                              "os-app-sidebar-section mt-2 px-4 pt-2 pb-1 w-full flex items-center group",
                              "!text-[11px] uppercase tracking-wide text-black/50"
                            )}
                            onClick={() => {
                              if (hasPrivate) {
                                playButtonClick();
                                toggleChannelsOpen();
                              }
                            }}
                            role="button"
                            aria-expanded={isChannelsOpen}
                          >
                            <span>{t("apps.chats.sidebar.rooms")}</span>
                            {hasPrivate && (
                              <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <CaretRight
                                  className={cn(
                                    "size-2.5 text-black/50 transition-transform",
                                    isChannelsOpen ? "rotate-90" : "rotate-0"
                                  )}
                                />
                              </span>
                            )}
                          </div>
                        )}
                        {channelsOpen && publicRooms.map(renderRoomItem)}

                        {privateRooms.length > 0 && (
                          <div
                            className={cn(
                              "os-app-sidebar-section mt-2 px-4 pt-2 pb-1 w-full flex items-center group",
                              "!text-[11px] uppercase tracking-wide text-black/50"
                            )}
                            onClick={() => {
                              playButtonClick();
                              togglePrivateOpen();
                            }}
                            role="button"
                            aria-expanded={isPrivateOpen}
                          >
                            <span>{t("apps.chats.sidebar.private")}</span>
                            <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <CaretRight
                                className={cn(
                                  "size-2.5 text-black/50 transition-transform",
                                  isPrivateOpen ? "rotate-90" : "rotate-0"
                                )}
                              />
                            </span>
                          </div>
                        )}
                        {isPrivateOpen && privateRooms.map(renderRoomItem)}
                      </>
                    ) : (
                      <>
                        {publicRooms.length > 0
                          ? publicRooms.map(renderRoomItem)
                          : privateRooms.map(renderRoomItem)}
                      </>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
