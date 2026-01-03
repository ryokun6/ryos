import React from "react";
import { Plus, Trash, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ChatRoom } from "@/types/chat";
import { useSound, Sounds } from "@/hooks/useSound";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { useChatsStore } from "@/stores/useChatsStore";
import { useThemeStore } from "@/stores/useThemeStore";
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
  /** When rendered inside mobile/overlay mode, occupies full width and hides right border */
  isOverlay?: boolean;
  username?: string | null;
}

export const ChatRoomSidebar: React.FC<ChatRoomSidebarProps> = ({
  rooms,
  currentRoom,
  onRoomSelect,
  onAddRoom,
  onDeleteRoom,
  isVisible,
  isAdmin,
  isOverlay = false,
  username,
}) => {
  const { t } = useTranslation();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const unreadCounts = useChatsStore((state) => state.unreadCounts);

  // Theme detection for border styling
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWindowsLegacyTheme = isXpTheme;

  // Section headings are non-interactive; show all lists by default

  // Read collapse state from store BEFORE any early returns to preserve hook order
  const isChannelsOpen = useChatsStore((s) => s.isChannelsOpen);
  const isPrivateOpen = useChatsStore((s) => s.isPrivateOpen);
  const toggleChannelsOpen = useChatsStore((s) => s.toggleChannelsOpen);
  const togglePrivateOpen = useChatsStore((s) => s.togglePrivateOpen);

  if (!isVisible) {
    return null;
  }

  const renderRoomItem = (room: ChatRoom) => {
    const unreadCount = unreadCounts[room.id] || 0;
    const hasUnread = unreadCount > 0;
    const isSelected = currentRoom?.id === room.id;

    return (
      <div
        key={room.id}
        className={cn(
          "group relative py-1 px-5",
          isSelected ? "" : "hover:bg-black/5"
        )}
        style={
          isSelected
            ? {
                background: "var(--os-color-selection-bg)",
                color: "var(--os-color-selection-text)",
              }
            : undefined
        }
        onClick={() => {
          playButtonClick();
          onRoomSelect(room);
        }}
      >
        <div className="flex items-center">
          <span>
            {room.type === "private"
              ? getPrivateRoomDisplayName(room, username ?? null)
              : `#${room.name}`}
          </span>
          {(hasUnread || room.type !== "private") && (
            <span
              className={cn(
                "text-[10px] ml-1.5 transition-opacity",
                hasUnread
                  ? "text-orange-600"
                  : currentRoom?.id === room.id
                  ? "text-white/40"
                  : "text-black/40",
                hasUnread || room.userCount > 0
                  ? "opacity-100"
                  : currentRoom?.id === room.id
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
                "absolute right-1 top-1/2 transform -translate-y-1/2 transition-opacity text-gray-500 hover:text-red-500 p-1 rounded hover:bg-black/5",
                currentRoom?.id === room.id
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
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
              <Trash className="w-3 h-3 text-black/30" weight="bold" />
            </button>
          )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col font-geneva-12 text-[12px] bg-neutral-100",
        isOverlay
          ? `w-full border-b ${
              isWindowsLegacyTheme
                ? "border-[#919b9c]"
                : currentTheme === "macosx"
                ? "border-black/10"
                : "border-black"
            }`
          : `w-56 border-r h-full overflow-hidden ${
              isWindowsLegacyTheme
                ? "border-[#919b9c]"
                : currentTheme === "macosx"
                ? "border-black/10"
                : "border-black"
            }`
      )}
    >
      <div
        className={cn(
          "pt-3 flex flex-col",
          isOverlay ? "pb-3" : "flex-1 overflow-hidden"
        )}
      >
        <div className="flex justify-between items-center mb-2 flex-shrink-0 px-3">
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-[14px] pl-1">{t("apps.chats.sidebar.chats")}</h2>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAddRoom}
                  className="flex items-center text-xs hover:bg-black/5 w-[24px] h-[24px]"
                >
                  <Plus className="w-3 h-3" weight="bold" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t("apps.chats.ariaLabels.newChat")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div
          className={cn(
            "space-y-1 overscroll-contain w-full",
            isOverlay
              ? "flex-1 overflow-y-auto min-h-0"
              : "flex-1 overflow-y-auto min-h-0"
          )}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Ryo (@ryo) Chat Selection */}
          <div
            className={cn(
              "py-1 px-5",
              currentRoom === null ? "" : "hover:bg-black/5"
            )}
            style={
              currentRoom === null
                ? {
                    background: "var(--os-color-selection-bg)",
                    color: "var(--os-color-selection-text)",
                  }
                : undefined
            }
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
                const publicRooms = rooms.filter(
                  (room) => room.type !== "private"
                );
                const privateRooms = rooms.filter(
                  (room) => room.type === "private"
                );
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
                              "mt-2 px-4 pt-2 pb-1 w-full flex items-center group",
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
                                    "w-2.5 h-2.5 text-black/50 transition-transform",
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
                              "mt-2 px-4 pt-2 pb-1 w-full flex items-center group",
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
                                  "w-2.5 h-2.5 text-black/50 transition-transform",
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
};
