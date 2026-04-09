import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PusherChannel } from "@/lib/pusherClient";
import {
  getPusherClient,
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import { useChatsStore } from "@/stores/useChatsStore";
import { toast } from "@/hooks/useToast";
import { type ChatRoom, type ChatMessage } from "@/types/chat";
import { useChatsStoreShallow } from "@/stores/helpers";
import { removeChatRoomById, upsertChatRoom } from "@/utils/chatRoomList";
import { shouldNotifyForRoomMessage } from "@/utils/chatNotifications";
import { showRoomMessageNotification } from "@/utils/chatNotificationDisplay";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

const getGlobalChannelName = (username?: string | null): string =>
  username
    ? `chats-${username.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "_")}`
    : "chats-public";

interface GlobalHandlers {
  onRoomCreated: (data: { room: ChatRoom }) => void;
  onRoomDeleted: (data: { roomId: string }) => void;
  onRoomUpdated: (data: { room: ChatRoom }) => void;
  onRoomsUpdated: (data: { rooms: ChatRoom[] }) => void;
}

interface PresenceUpdatePayload {
  username: string;
  action: "joined" | "left";
  userCount: number;
}

interface TypingPayload {
  username: string;
  isTyping: boolean;
}

interface RoomHandlers {
  onRoomMessage: (data: { message: ChatMessage }) => void;
  onMessageDeleted: (data: { messageId: string; roomId: string }) => void;
  onPresenceUpdate: (data: PresenceUpdatePayload) => void;
  onUserTyping: (data: TypingPayload) => void;
}

export function useChatRoom(
  isWindowOpen: boolean,
  onPromptSetUsername?: () => void
) {
  const { t } = useTranslation();
  const {
    username,
    isAuthenticated,
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
    isAuthenticated: state.isAuthenticated,
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
  const globalHandlersRef = useRef<GlobalHandlers | null>(null);
  const roomChannelsRef = useRef<Record<string, PusherChannel>>({});
  const roomHandlersRef = useRef<Record<string, RoomHandlers>>({});
  const hasInitialized = useRef(false);

  // Typing indicator state: map of roomId → Set<username> currently typing
  const [typingUsers, setTypingUsers] = useState<Record<string, Set<string>>>({});
  const typingTimersRef = useRef<Record<string, Record<string, ReturnType<typeof setTimeout>>>>({});
  const lastTypingEmitRef = useRef<number>(0);

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

  const unsubscribeGlobalChannel = useCallback(() => {
    const channel = globalChannelRef.current;
    const handlers = globalHandlersRef.current;

    if (channel && handlers) {
      channel.unbind("room-created", handlers.onRoomCreated);
      channel.unbind("room-deleted", handlers.onRoomDeleted);
      channel.unbind("room-updated", handlers.onRoomUpdated);
      channel.unbind("rooms-updated", handlers.onRoomsUpdated);
    }

    if (channel) {
      unsubscribePusherChannel(channel.name);
    }

    globalChannelRef.current = null;
    globalHandlersRef.current = null;
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
      unsubscribeGlobalChannel();
    }

    if (!globalChannelRef.current) {
      console.log(
        `[Pusher Hook] Subscribing to global channel: ${channelName}`
      );
      const channel = subscribePusherChannel(channelName);

      // Create event handlers (apply local diffs to avoid refetch)
      const handlers: GlobalHandlers = {
        onRoomCreated: (data) => {
          if (!data?.room?.id) {
            void fetchRooms();
            return;
          }

          console.log("[Pusher Hook] Room created:", data.room);
          const { rooms: currentRooms } = useChatsStore.getState();
          setRooms(upsertChatRoom(currentRooms, data.room));
        },
        onRoomDeleted: (data) => {
          if (!data?.roomId) {
            void fetchRooms();
            return;
          }

          console.log("[Pusher Hook] Room deleted:", data.roomId);
          const { rooms: currentRooms } = useChatsStore.getState();
          setRooms(removeChatRoomById(currentRooms, data.roomId));
        },
        onRoomUpdated: (data) => {
          if (!data?.room?.id) {
            void fetchRooms();
            return;
          }

          console.log("[Pusher Hook] Room updated:", data.room);
          const { rooms: currentRooms } = useChatsStore.getState();
          setRooms(upsertChatRoom(currentRooms, data.room));
        },
        onRoomsUpdated: (data) => {
          if (!Array.isArray(data?.rooms)) {
            void fetchRooms();
            return;
          }

          console.log(
            "[Pusher Hook] Rooms updated:",
            data.rooms.length,
            "rooms"
          );
          // Update rooms directly instead of fetching from API
          setRooms(data.rooms);
        },
      };

      // Bind the handlers
      channel.bind("room-created", handlers.onRoomCreated);
      channel.bind("room-deleted", handlers.onRoomDeleted);
      channel.bind("room-updated", handlers.onRoomUpdated);
      channel.bind("rooms-updated", handlers.onRoomsUpdated);

      globalChannelRef.current = channel;
      globalHandlersRef.current = handlers;
    }
  }, [username, fetchRooms, setRooms, unsubscribeGlobalChannel]);

  const subscribeToRoomChannel = useCallback(
    (roomId: string) => {
      if (!pusherRef.current || roomChannelsRef.current[roomId]) return;

      console.log(`[Pusher Hook] Subscribing to room channel: room-${roomId}`);
      const roomChannel = subscribePusherChannel(`room-${roomId}`);

      const handlers: RoomHandlers = {
        onRoomMessage: (data) => {
          if (!data?.message?.roomId || !data.message.id) {
            return;
          }

          console.log("[Pusher Hook] Received room-message:", data.message);

          const { roomMessages: roomMessagesMap } = useChatsStore.getState();
          const existingMessages = roomMessagesMap[data.message.roomId] || [];
          if (
            existingMessages.some((message) => message.id === data.message.id)
          ) {
            return;
          }

          const parsedTimestamp =
            typeof data.message.timestamp === "string" ||
            typeof data.message.timestamp === "number"
              ? new Date(data.message.timestamp).getTime()
              : Date.now();

          const messageWithTimestamp = {
            ...data.message,
            timestamp: Number.isFinite(parsedTimestamp)
              ? parsedTimestamp
              : Date.now(),
          };

          addMessageToRoom(data.message.roomId, messageWithTimestamp);

          // Clear typing indicator for the sender since they just sent a message
          setTypingUsers((prev) => {
            const roomTyping = prev[data.message.roomId];
            if (!roomTyping?.has(data.message.username)) return prev;
            const next = new Set(roomTyping);
            next.delete(data.message.username);
            return { ...prev, [data.message.roomId]: next };
          });

          const { currentRoomId: activeRoomId } = useChatsStore.getState();
          if (
            !shouldNotifyForRoomMessage({
              chatsOpen: true,
              currentRoomId: activeRoomId,
              messageRoomId: data.message.roomId,
            })
          ) {
            return;
          }

          incrementUnread(data.message.roomId);
          const decoded = decodeHtmlEntities(String(data.message.content || ""));
          showRoomMessageNotification({
            username: data.message.username,
            content: decoded,
            roomId: data.message.roomId,
            messageId: data.message.id,
          });
        },
        onMessageDeleted: (data) => {
          console.log("[Pusher Hook] Message deleted:", data.messageId);
          removeMessageFromRoom(data.roomId, data.messageId);
        },
        onPresenceUpdate: (data) => {
          if (!data?.username || !data.action) return;
          const { rooms: currentRooms } = useChatsStore.getState();
          const room = currentRooms.find((r) => r.id === roomId);
          if (room) {
            setRooms(upsertChatRoom(currentRooms, { ...room, userCount: data.userCount }));
          }
        },
        onUserTyping: (data) => {
          if (!data?.username) return;
          const selfUsername = useChatsStore.getState().username;
          if (data.username === selfUsername) return;

          if (data.isTyping) {
            setTypingUsers((prev) => {
              const current = prev[roomId] || new Set<string>();
              if (current.has(data.username)) return prev;
              const next = new Set(current);
              next.add(data.username);
              return { ...prev, [roomId]: next };
            });

            // Auto-expire after 4s if no further event
            if (!typingTimersRef.current[roomId]) {
              typingTimersRef.current[roomId] = {};
            }
            const existing = typingTimersRef.current[roomId][data.username];
            if (existing) clearTimeout(existing);
            typingTimersRef.current[roomId][data.username] = setTimeout(() => {
              setTypingUsers((prev) => {
                const current = prev[roomId];
                if (!current?.has(data.username)) return prev;
                const next = new Set(current);
                next.delete(data.username);
                return { ...prev, [roomId]: next };
              });
              delete typingTimersRef.current[roomId]?.[data.username];
            }, 4000);
          } else {
            setTypingUsers((prev) => {
              const current = prev[roomId];
              if (!current?.has(data.username)) return prev;
              const next = new Set(current);
              next.delete(data.username);
              return { ...prev, [roomId]: next };
            });
            const existing = typingTimersRef.current[roomId]?.[data.username];
            if (existing) {
              clearTimeout(existing);
              delete typingTimersRef.current[roomId][data.username];
            }
          }
        },
      };

      roomChannel.bind("room-message", handlers.onRoomMessage);
      roomChannel.bind("message-deleted", handlers.onMessageDeleted);
      roomChannel.bind("presence-update", handlers.onPresenceUpdate);
      roomChannel.bind("user-typing", handlers.onUserTyping);

      roomChannelsRef.current[roomId] = roomChannel;
      roomHandlersRef.current[roomId] = handlers;
    },
    [addMessageToRoom, removeMessageFromRoom, incrementUnread, setRooms]
  );

  const unsubscribeFromRoomChannel = useCallback((roomId: string) => {
    const channel = roomChannelsRef.current[roomId];
    const handlers = roomHandlersRef.current[roomId];

    if (!channel) {
      return;
    }

    console.log(
      `[Pusher Hook] Unsubscribing from room channel: room-${roomId}`
    );
    if (handlers) {
      channel.unbind("room-message", handlers.onRoomMessage);
      channel.unbind("message-deleted", handlers.onMessageDeleted);
      channel.unbind("presence-update", handlers.onPresenceUpdate);
      channel.unbind("user-typing", handlers.onUserTyping);
    }

    // Clean up typing timers for this room
    const roomTimers = typingTimersRef.current[roomId];
    if (roomTimers) {
      Object.values(roomTimers).forEach(clearTimeout);
      delete typingTimersRef.current[roomId];
    }

    unsubscribePusherChannel(channel.name);
    delete roomChannelsRef.current[roomId];
    delete roomHandlersRef.current[roomId];
  }, []);

  const unsubscribeAllRoomChannels = useCallback(() => {
    const roomIds = Object.keys(roomChannelsRef.current);
    roomIds.forEach((roomId) => {
      unsubscribeFromRoomChannel(roomId);
    });
  }, [unsubscribeFromRoomChannel]);

  // --- Typing Indicator Emission ---
  const TYPING_THROTTLE_MS = 2000;

  const emitTyping = useCallback(
    (roomId: string) => {
      if (!username || !isAuthenticated || !roomId) return;
      const now = Date.now();
      if (now - lastTypingEmitRef.current < TYPING_THROTTLE_MS) return;
      lastTypingEmitRef.current = now;

      abortableFetch(getApiUrl(`/api/rooms/${roomId}/typing`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTyping: true }),
        timeout: 5000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 100 },
      }).catch(() => {});
    },
    [username, isAuthenticated]
  );

  // Helper to get typing users for the current room
  const currentRoomTypingUsers = currentRoomId
    ? Array.from(typingUsers[currentRoomId] || [])
    : [];

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
          toast.error(t("apps.chats.status.loginRequired"), {
            description: t("apps.chats.status.pleaseLoginToSendMessages"),
            duration: 5000,
            action: onPromptSetUsername
              ? {
                  label: t("apps.chats.status.loginButton"),
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
    [currentRoomId, username, sendMessage, onPromptSetUsername, t]
  );

  const handleAddRoom = useCallback(
    async (
      roomName: string,
      type: "public" | "private" | "irc" = "public",
      members: string[] = [],
      ircOptions: {
        ircHost?: string;
        ircPort?: number;
        ircTls?: boolean;
        ircChannel?: string;
        ircServerLabel?: string;
      } = {}
    ) => {
      if (!username) return { ok: false, error: "Set a username first." };

      if (type === "public" && !isAdmin) {
        return {
          ok: false,
          error: "Permission denied. Admin access required.",
        };
      }

      if (type === "irc" && !isAdmin) {
        return {
          ok: false,
          error: "Permission denied. Admin access required for IRC rooms.",
        };
      }

      const result = await createRoom(roomName, type, members, ircOptions);
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
        toast.error(t("apps.chats.status.loginRequired"), {
          description: t("apps.chats.status.pleaseLoginToDeleteRooms"),
          duration: 5000,
          action: onPromptSetUsername
            ? {
                label: t("apps.chats.status.loginButton"),
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
  }, [roomToDelete, handleDeleteRoom, onPromptSetUsername, t]);

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
      unsubscribeAllRoomChannels();

      // Unsubscribe from global channel
      unsubscribeGlobalChannel();

      // NOTE: We intentionally do NOT disconnect the global Pusher singleton here.
      // We only unsubscribe from channels we've created. The underlying WebSocket
      // stays open, preventing rapid connect/disconnect cycles under React
      // Strict-Mode development re-mounts.
    };
  }, [unsubscribeAllRoomChannels, unsubscribeGlobalChannel]);

  return {
    // State
    username,
    isAuthenticated,
    rooms,
    currentRoomId,
    currentRoomMessages,
    currentRoomMessagesLimited,
    isSidebarVisible,
    isAdmin,

    // Typing indicators
    currentRoomTypingUsers,
    emitTyping,

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
