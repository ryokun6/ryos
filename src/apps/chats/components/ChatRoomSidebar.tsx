import React from 'react';
import { Plus, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ChatRoom } from "@/types/chat";
import { useSound, Sounds } from "@/hooks/useSound";

// Extracted ChatRoomSidebar component
interface ChatRoomSidebarProps {
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  onRoomSelect: (room: ChatRoom | null) => void;
  onAddRoom?: () => void;
  onDeleteRoom?: (room: ChatRoom) => void;
  isVisible: boolean;
  isAdmin: boolean;
  /** When rendered inside mobile/overlay mode, occupies full width and hides right border */
  isOverlay?: boolean;
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
}) => {
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden font-geneva-12 text-[12px] border-black bg-neutral-100",
        isOverlay ? "w-full border-b" : "w-56 border-r"
      )}
    >
      <div className="py-3 px-3 flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-baseline gap-1.5">
            <h2 className="text-[14px] pl-1">Chats</h2>
          </div>
          {onAddRoom && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAddRoom}
              className="flex items-center text-xs hover:bg-black/5 w-[24px] h-[24px]"
            >
              <Plus className="w-3 h-3" />
            </Button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {/* Ryo (@ryo) Chat Selection */}
          <div
            className={cn(
              'p-2 py-1',
              currentRoom === null ? 'bg-black text-white' : 'hover:bg-black/5'
            )}
            onClick={() => {
              playButtonClick();
              onRoomSelect(null);
            }}
          >
            @ryo
          </div>
          {/* Chat Rooms List */}
          {Array.isArray(rooms) && rooms.map((room) => (
            <div
              key={room.id}
              className={cn(
                'group relative p-2 py-1',
                currentRoom?.id === room.id ? 'bg-black text-white' : 'hover:bg-black/5'
              )}
              onClick={() => {
                playButtonClick();
                onRoomSelect(room);
              }}
            >
              <div className="flex items-center">
                <span>#{room.name}</span>
                <span className={cn(
                  "text-[10px] ml-1.5 transition-opacity",
                  currentRoom?.id === room.id ? "text-white/40" : "text-black/40",
                  room.userCount > 0 ? "opacity-100" : (currentRoom?.id === room.id ? "opacity-100" : "opacity-0 group-hover:opacity-100")
                )}>
                  {room.userCount} online
                </span>
              </div>
              {isAdmin && onDeleteRoom && (
                <button
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-500 p-1 rounded hover:bg-black/5"
                  onClick={(e) => {
                    e.stopPropagation();
                    playButtonClick();
                    onDeleteRoom(room);
                  }}
                  aria-label="Delete room"
                >
                  <Trash className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}; 