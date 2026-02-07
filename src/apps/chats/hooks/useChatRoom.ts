import { useState, useEffect, useCallback, useRef } from "react";
import type { PusherChannel } from "@/lib/pusherClient";
import { getPusherClient } from "@/lib/pusherClient";
import { useChatsStore } from "../../../stores/useChatsStore";
import { toast } from "@/hooks/useToast";
import { type ChatRoom, type ChatMessage } from "../../../../src/types/chat";
import { useChatsStoreShallow } from "@/stores/helpers";
import { openChatRoomFromNotification } from "@/utils/openChatRoomFromNotification";

const getGlobalChannelName = (username?: string | null): string =>
  username
    ? `chats-${username.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "_")}`
    : "chats-public";

// Decode common HTML entities so toast previews show readable text
const decodeHtmlEntities = (str: string): string => {
  if (!str) return str;
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
};

export function useChatRoom(
  isWindowOpen: boolean,
  onPromptSetUsername?: () => void
) {
  const {
    username,
    authToken,
    rooms,
    currentRoomId,
    roomMessages,
    isSidebarVisible,
    toggleSidebarVisibility,
    // Store methods
    fetchRooms,
    fetchBulkMessages,
    setRooms,
    switchRoom,
    createRoom,
    deleteRoom,
    sendMessage,
    addMessageToRoom,
    removeMessageFromRoom,
    incrementUnread,
    messageRenderLimit,
  } = useChatsStoreShallow((state) => ({
    username: state.username,
    authToken: state.authToken,
    rooms: state.rooms,
    currentRoomId: state.currentRoomId,
    roomMessages: state.roomMessages,
    isSidebarVisible: state.isSidebarVisible,
    toggleSidebarVisibility: state.toggleSidebarVisibility,
    fetchRooms: state.fetchRooms,
    fetchBulkMessages: state.fetchBulkMessages,
    setRooms: state.setRooms,
    switchRoom: state.switchRoom,
    createRoom: state.createRoom,
    deleteRoom: state.deleteRoom,
    sendMessage: state.sendMessage,
    addMessageToRoom: state.addMessageToRoom,
    removeMessageFromRoom: state.removeMessageFromRoom,
    incrementUnread: state.incrementUnread,
    messageRenderLimit: state.messageRenderLimit,
  }));

  // Derive isAdmin directly from the username
  const isAdmin = username === "ryo";

  // Pusher refs
  const pusherRef = useRef<ReturnType<typeof getPusherClient> | null>(null);
  const globalChannelRef = useRef<PusherChannel | null>(null);
  const roomChannelsRef = useRef<Record<string, PusherChannel>>({});
  const hasInitialized = useRef(false);

  // Dialog states (only room-related)
  const [isNewRoomDialogOpen, setIsNewRoomDialogOpen] = useState(false);
  const [isDeleteRoomDialogOpen, setIsDeleteRoomDialogOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<ChatRoom | null>(null);

  // Get current room messages
  const currentRoomMessages = currentRoomId
    ? roomMessages[currentRoomId] || []
    : [];

  // Limit messages rendered initially for performance
  const currentRoomMessagesLimited = currentRoomId
    ? (roomMessages[currentRoomId] || []).slice(-messageRenderLimit)
    : [];

  // --- Pusher Setup ---
  const initializePusher = useCallback(() => {
    if (pusherRef.current) return;

    console.log("[Pusher Hook] Getting singleton Pusher client...");
    pusherRef.current = getPusherClient();

    pusherRef.current.connection.bind("connected", () => {
      console.log("[Pusher Hook] Connected to Pusher");
    });

    pusherRef.current.connection.bind("error", (error: Error) => {
      console.error("[Pusher Hook] Connection error:", error);
    });
  }, []);

  const subscribeToGlobalChannel = useCallback(() => {
    if (!pusherRef.current) return;

    const channelName = getGlobalChannelName(username);

    // Unsubscribe from previous channel if different
    if (
      globalChannelRef.current &&
      globalChannelRef.current.name !== channelName
    ) {
      console.log(
        `[Pusher Hook] Unsubscribing from old global channel: ${globalChannelRef.current.name}`
      );
      pusherRef.current.unsubscribe(globalChannelRef.current.name);
      globalChannelRef.current = null;
    }

    if (!globalChannelRef.current) {
      console.log(
        `[Pusher Hook] Subscribing to global channel: ${channelName}`
      );
      globalChannelRef.current = pusherRef.current.subscribe(channelName);

      // Create event handlers (apply local diffs to avoid refetch)
      const handleRoomCreated = (data: { room: ChatRoom }) => {
        console.log("[Pusher Hook] Room created:", data.room);
        const { rooms: currentRooms } = useChatsStore.getState();
        const exists = currentRooms.some((r) => r.id === data.room.id);
        if (!exists) setRooms([...currentRooms, data.room]);
      };

      const handleRoomDeleted = (data: { roomId: string }) => {
        console.log("[Pusher Hook] Room deleted:", data.roomId);
        const { rooms: currentRooms } = useChatsStore.getState();
        setRooms(currentRooms.filter((r) => r.id !== data.roomId));
      };

      const handleRoomUpdated = (data: { room: ChatRoom }) => {
        console.log("[Pusher Hook] Room updated:", data.room);
        const { rooms: currentRooms } = useChatsStore.getState();
        const next = currentRooms.map((r) =>
          r.id === data.room.id ? { ...r, ...data.room } : r
        );
        setRooms(next);
      };

      const handleRoomsUpdated = (data: { rooms: ChatRoom[] }) => {
        console.log("[Pusher Hook] Rooms updated:", data.rooms.length, "rooms");
        // Update rooms directly instead of fetching from API
        setRooms(data.rooms);
      };

      // Unbind any existing handlers first (safety measure)
      globalChannelRef.current.unbind("room-created");
      globalChannelRef.current.unbind("room-deleted");
      globalChannelRef.current.unbind("room-updated");
      globalChannelRef.current.unbind("rooms-updated");

      // Bind the handlers
      globalChannelRef.current.bind("room-created", handleRoomCreated);
      globalChannelRef.current.bind("room-deleted", handleRoomDeleted);
      globalChannelRef.current.bind("room-updated", handleRoomUpdated);
      globalChannelRef.current.bind("rooms-updated", handleRoomsUpdated);
    }
  }, [username, fetchRooms, setRooms]);

  const subscribeToRoomChannel = useCallback(
    (roomId: string) => {
      if (!pusherRef.current || roomChannelsRef.current[roomId]) return;

      console.log(`[Pusher Hook] Subscribing to room channel: room-${roomId}`);
      const roomChannel = pusherRef.current.subscribe(`room-${roomId}`);
      roomChannelsRef.current[roomId] = roomChannel;

      // Create event handlers with unique names to prevent duplicate binding
      const handleRoomMessage = (data: { message: ChatMessage }) => {
        console.log("[Pusher Hook] Received room-message:", data.message);

        // Add message with proper timestamp
        const messageWithTimestamp = {
          ...data.message,
          timestamp:
            typeof data.message.timestamp === "string" ||
            typeof data.message.timestamp === "number"
              ? new Date(data.message.timestamp).getTime()
              : data.message.timestamp,
        };

        addMessageToRoom(data.message.roomId, messageWithTimestamp);

        // Show toast if the message is for a room that is not currently open
        const { currentRoomId: activeRoomId } = useChatsStore.getState();
        if (activeRoomId !== data.message.roomId) {
          incrementUnread(data.message.roomId);
          const decoded = decodeHtmlEntities(
            String(data.message.content || "")
          );
          const preview = decoded.replace(/\s+/g, " ").trim().slice(0, 80);
          toast(`@${data.message.username}`, {
            description: preview,
            action: {
              label: "Open",
              onClick: () => {
                openChatRoomFromNotification(data.message.roomId);
              },
            },
          });
        }
      };

      const handleMessageDeleted = (data: {
        messageId: string;
        roomId: string;
      }) => {
        console.log("[Pusher Hook] Message deleted:", data.messageId);
        // Remove the message locally so UI reflects deletion
        removeMessageFromRoom(data.roomId, data.messageId);
      };

      // Unbind any existing handlers first (safety measure)
      roomChannel.unbind("room-message");
      roomChannel.unbind("message-deleted");

      // Bind the handlers
      roomChannel.bind("room-message", handleRoomMessage);
      roomChannel.bind("message-deleted", handleMessageDeleted);
    },
    [addMessageToRoom, removeMessageFromRoom, incrementUnread]
  );

  const unsubscribeFromRoomChannel = useCallback((roomId: string) => {
    if (!pusherRef.current || !roomChannelsRef.current[roomId]) return;

    console.log(
      `[Pusher Hook] Unsubscribing from room channel: room-${roomId}`
    );
    pusherRef.current.unsubscribe(`room-${roomId}`);
    delete roomChannelsRef.current[roomId];
  }, []);

  // --- Room Management ---
  const handleRoomSelect = useCallback(
    async (newRoomId: string | null) => {
      if (newRoomId === currentRoomId) return;

      console.log(`[Room Hook] Switching to room: ${newRoomId || "@ryo"}`);

      // Check if the target room has unread messages before switching
      const { unreadCounts } = useChatsStore.getState();
      const hadUnreads = newRoomId ? (unreadCounts[newRoomId] || 0) > 0 : false;

      // Simply switch room; we keep subscriptions so notifications still arrive.
      await switchRoom(newRoomId);

      // Ensure we're subscribed to the new room channel (no-op if already)
      if (newRoomId) {
        subscribeToRoomChannel(newRoomId);
      }

      return { hadUnreads };
    },
    [currentRoomId, switchRoom, subscribeToRoomChannel]
  );

  const sendRoomMessage = useCallback(
    async (content: string) => {
      if (!currentRoomId || !username || !content.trim()) return;

      const result = await sendMessage(currentRoomId, content.trim());
      if (!result.ok) {
        // Check if this is an authentication error
        const isAuthError =
          result.error?.toLowerCase().includes("authentication required") ||
          result.error?.toLowerCase().includes("unauthorized") ||
          result.error?.toLowerCase().includes("authentication failed") ||
          result.error?.toLowerCase().includes("username mismatch");

        if (isAuthError) {
          toast.error("Login Required", {
            description: "Please login to send messages.",
            duration: 5000,
            action: onPromptSetUsername
              ? {
                  label: "Login",
                  onClick: onPromptSetUsername,
                }
              : undefined,
          });
        } else {
          toast("Error", {
            description: result.error || "Failed to send message.",
          });
        }
      }
    },
    [currentRoomId, username, sendMessage, onPromptSetUsername]
  );

  const handleAddRoom = useCallback(
    async (
      roomName: string,
      type: "public" | "private" = "public",
      members: string[] = []
    ) => {
      if (!username) return { ok: false, error: "Set a username first." };

      if (type === "public" && !isAdmin) {
        return {
          ok: false,
          error: "Permission denied. Admin access required.",
        };
      }

      const result = await createRoom(roomName, type, members);
      if (result.ok && result.roomId) {
        handleRoomSelect(result.roomId); // Switch to the new room
      }
      return result;
    },
    [username, isAdmin, createRoom, handleRoomSelect]
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      if (!roomId) {
        return { ok: false, error: "Invalid room." };
      }

      // Get the room to check its type
      const room = rooms.find((r) => r.id === roomId);
      if (!room) {
        return { ok: false, error: "Room not found." };
      }

      // For public rooms, only admin can delete
      if (room.type !== "private" && !isAdmin) {
        return {
          ok: false,
          error: "Permission denied. Admin access required for public rooms.",
        };
      }

      // For private rooms, the API will check if user is a member
      const result = await deleteRoom(roomId);
      if (result.ok && currentRoomId === roomId) {
        handleRoomSelect(null); // Switch back to @ryo
      }
      return result;
    },
    [isAdmin, deleteRoom, currentRoomId, handleRoomSelect, rooms]
  );

  // --- Dialog Handlers ---

  const promptAddRoom = useCallback(() => {
    setIsNewRoomDialogOpen(true);
  }, []);

  const promptDeleteRoom = useCallback((room: ChatRoom) => {
    setRoomToDelete(room);
    setIsDeleteRoomDialogOpen(true);
  }, []);

  const confirmDeleteRoom = useCallback(async () => {
    if (!roomToDelete) return;

    const result = await handleDeleteRoom(roomToDelete.id);
    if (result.ok) {
      setIsDeleteRoomDialogOpen(false);
      setRoomToDelete(null);
    } else {
      // Check if this is an authentication error
      const isAuthError =
        result.error?.toLowerCase().includes("authentication required") ||
        result.error?.toLowerCase().includes("unauthorized") ||
        result.error?.toLowerCase().includes("authentication failed") ||
        result.error?.toLowerCase().includes("username mismatch");

      if (isAuthError) {
        toast.error("Login Required", {
          description: "Please login to delete rooms.",
          duration: 5000,
          action: onPromptSetUsername
            ? {
                label: "Login",
                onClick: onPromptSetUsername,
              }
            : undefined,
        });
      } else {
        toast("Error", {
          description: result.error || "Failed to delete room.",
        });
      }
    }
  }, [roomToDelete, handleDeleteRoom, onPromptSetUsername]);

  // --- Effects ---

  // Initialize when window opens
  useEffect(() => {
    if (!isWindowOpen || hasInitialized.current) return;

    console.log("[Room Hook] Initializing chat room...");
    hasInitialized.current = true;

    initializePusher();
    (async () => {
      const result = await fetchRooms();
      if (result.ok) {
        // Get fresh rooms list to fetch messages for all visible rooms
        const { rooms: freshRooms } = useChatsStore.getState();
        if (freshRooms.length > 0) {
          // Limit initial fetch to first 5 rooms to reduce load; others lazy-load via channel
          const limitedIds = freshRooms.slice(0, 5).map((room) => room.id);
          console.log(
            `[useChatRoom] Initial bulk fetch of messages for ${limitedIds.length} rooms`
          );
          const bulkResult = await fetchBulkMessages(limitedIds);

          // For experienced users, don't recalculate unreads on reload - only track new messages going forward
          if (bulkResult.ok) {
            const { hasEverUsedChats, setHasEverUsedChats } =
              useChatsStore.getState();

            if (!hasEverUsedChats) {
              // First time user - mark all as read from this point forward
              console.log(
                `[useChatRoom] First-time user detected - skipping unread calculation and marking as experienced user`
              );
              setHasEverUsedChats(true);
            } else {
              console.log(
                `[useChatRoom] Experienced user - skipping unread recalculation on reload, will track new messages only`
              );
            }
          }
        }
      }
    })();
  }, [isWindowOpen, initializePusher, fetchRooms, fetchBulkMessages]);

  // Handle username changes
  useEffect(() => {
    if (!isWindowOpen) return;

    subscribeToGlobalChannel();
  }, [isWindowOpen, username, subscribeToGlobalChannel]);

  // Maintain subscriptions for ALL visible rooms
  useEffect(() => {
    if (!isWindowOpen) return;

    // Subscribe to any room we can see
    rooms.forEach((room) => {
      subscribeToRoomChannel(room.id);
    });

    // Unsubscribe from rooms no longer visible
    Object.keys(roomChannelsRef.current).forEach((roomId) => {
      const stillVisible = rooms.some((room) => room.id === roomId);
      if (!stillVisible) {
        unsubscribeFromRoomChannel(roomId);
      }
    });
  }, [isWindowOpen, rooms, subscribeToRoomChannel, unsubscribeFromRoomChannel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[Pusher Hook] Cleaning up...");

      // Unsubscribe from all room channels
      Object.keys(roomChannelsRef.current).forEach((roomId) => {
        unsubscribeFromRoomChannel(roomId);
      });

      // Unsubscribe from global channel
      if (globalChannelRef.current && pusherRef.current) {
        pusherRef.current.unsubscribe(globalChannelRef.current.name);
        globalChannelRef.current = null;
      }

      // NOTE: We intentionally do NOT disconnect the global Pusher singleton here.
      // We only unsubscribe from channels we've created. The underlying WebSocket
      // stays open, preventing rapid connect/disconnect cycles under React
      // Strict-Mode development re-mounts.
    };
  }, [unsubscribeFromRoomChannel]);

  return {
    // State
    username,
    authToken,
    rooms,
    currentRoomId,
    currentRoomMessages,
    currentRoomMessagesLimited,
    isSidebarVisible,
    isAdmin,

    // Actions
    handleRoomSelect,
    sendRoomMessage,
    toggleSidebarVisibility,
    handleAddRoom,
    promptAddRoom,
    promptDeleteRoom,

    // Room dialogs
    isNewRoomDialogOpen,
    setIsNewRoomDialogOpen,
    isDeleteRoomDialogOpen,
    setIsDeleteRoomDialogOpen,
    roomToDelete,
    confirmDeleteRoom,
  };
}
