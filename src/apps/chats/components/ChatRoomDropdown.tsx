import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type ChatRoom } from "@/types/chat";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { useChatsStore } from "@/stores/useChatsStore";
import {
  isPrivateRoomOnline,
  sortPrivateRoomsForSidebar,
} from "../utils/privateRoomOrdering";
import { getRoomActivitySignature } from "../utils/roomActivitySignature";

interface ChatRoomDropdownProps {
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  onRoomSelect: (room: ChatRoom | null) => void;
  onAddRoom: () => void;
  username?: string | null;
  onlineUsers?: string[];
  /** Trigger element (rendered via Radix `asChild`). */
  children: React.ReactNode;
}

/**
 * Room switcher for narrow (mobile) frames: anchors the shared dropdown menu
 * to the chat header title instead of the desktop sidebar.
 */
export function ChatRoomDropdown({
  rooms,
  currentRoom,
  onRoomSelect,
  onAddRoom,
  username,
  onlineUsers = [],
  children,
}: ChatRoomDropdownProps) {
  const { t } = useTranslation();
  const roomActivitySignature = useChatsStore((s) =>
    getRoomActivitySignature(Array.isArray(rooms) ? rooms : [], s.roomMessages)
  );
  const unreadCounts = useChatsStore((s) => s.unreadCounts);

  const { publicRooms, privateRooms } = useMemo(() => {
    const nextPublicRooms: ChatRoom[] = [];
    const nextPrivateRooms: ChatRoom[] = [];
    const roomMessages = useChatsStore.getState().roomMessages;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineUsers, roomActivitySignature, rooms, username]);

  const hasBoth = publicRooms.length > 0 && privateRooms.length > 0;

  const renderRoomItem = (room: ChatRoom) => {
    const isOnline = Boolean(
      room.type === "private" &&
        isPrivateRoomOnline(room, username, onlineUsers)
    );
    const unreadCount = unreadCounts[room.id] || 0;

    return (
      <DropdownMenuCheckboxItem
        key={room.id}
        checked={currentRoom?.id === room.id}
        onCheckedChange={(checked) => {
          if (checked) onRoomSelect(room);
        }}
        className="text-md h-6"
      >
        <span className="flex w-full min-w-0 items-center">
          {isOnline && (
            <span
              className="mr-1.5 inline-block size-1.5 flex-shrink-0 rounded-full bg-green-500"
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
              className="ml-1 flex-shrink-0 text-[9px] font-bold uppercase tracking-wider opacity-40"
              title={`IRC ${room.ircHost || "irc.pieter.com"}`}
            >
              irc
            </span>
          )}
          {unreadCount > 0 && (
            <span className="ml-auto flex-shrink-0 whitespace-nowrap pl-2 text-[10px] text-orange-600">
              {`${unreadCount >= 20 ? "20+" : unreadCount} ${t(
                "apps.chats.sidebar.new"
              )}`}
            </span>
          )}
        </span>
      </DropdownMenuCheckboxItem>
    );
  };

  const sectionLabelClassName = cn(
    "flex h-5 items-center px-3 py-0 font-normal",
    "!text-[10px] uppercase tracking-wide opacity-50"
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={2}
        className="max-h-[min(60vh,320px)] min-w-[200px] max-w-[280px] overflow-y-auto px-0"
      >
        {/* Ryo (@ryo) Chat Selection */}
        <DropdownMenuCheckboxItem
          checked={currentRoom === null}
          onCheckedChange={(checked) => {
            if (checked) onRoomSelect(null);
          }}
          className="text-md h-6"
        >
          {t("apps.chats.status.ryo")}
        </DropdownMenuCheckboxItem>

        {hasBoth ? (
          <>
            <DropdownMenuLabel className={sectionLabelClassName}>
              {t("apps.chats.sidebar.rooms")}
            </DropdownMenuLabel>
            {publicRooms.map(renderRoomItem)}
            <DropdownMenuLabel className={sectionLabelClassName}>
              {t("apps.chats.sidebar.private")}
            </DropdownMenuLabel>
            {privateRooms.map(renderRoomItem)}
          </>
        ) : (
          <>
            {(publicRooms.length > 0 ? publicRooms : privateRooms).map(
              renderRoomItem
            )}
          </>
        )}

        {username && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onAddRoom}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.newChat")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
