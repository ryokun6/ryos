import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { PusherChannel } from "@/lib/pusherClient";
import {
  getPusherClient,
  subscribePusherChannel,
  subscribeRealtimeConnection,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import { useChatsStore } from "@/stores/useChatsStore";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { toast } from "@/hooks/useToast";
import { type ChatRoom, type ChatMessage } from "@/types/chat";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import { removeChatRoomById, upsertChatRoom } from "@/utils/chatRoomList";
import { shouldNotifyForRoomMessage } from "@/utils/chatNotifications";
import { showRoomMessageNotification } from "@/utils/chatNotificationDisplay";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { shouldSubscribeToForegroundRoomUpdates } from "@/utils/chatRoomSubscriptions";
import {
  getChatRoomChannelName,
  getChatsGlobalChannelName,
} from "@/shared/constants/realtime";
import {
  normalizeChatTimestamp,
  type CreateRoomIrcOptions,
} from "@/shared/contracts/chat";

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

const EMPTY_MESSAGES: ChatMessage[] = [];

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

  const isAdmin = useIsRyoAdmin();

  // Pusher refs
  const pusherRef = useRef<ReturnType<typeof getPusherClient> | null>(null);
  const globalChannelRef = useRef<PusherChannel | null>(null);
  const globalHandlersRef = useRef<GlobalHandlers | null>(null);
  const roomChannelsRef = useRef<Record<string, PusherChannel>>({});
  const roomHandlersRef = useRef<Record<string, RoomHandlers>>({});
  const connectionStateUnsubscribeRef = useRef<(() => void) | null>(null);
  const hasInitialized = useRef(false);

  // Typing indicator state: map of roomId → Set<username> currently typing
  const [typingUsers, setTypingUsers] = useState<Record<string, Set<string>>>({});
  const typingTimersRef = useRef<Record<string, Record<string, ReturnType<typeof setTimeout>>>>({});
  const lastTypingEmitRef = useRef<number>(0);

  // Dialog states (only room-related)
  const [isNewRoomDialogOpen, setIsNewRoomDialogOpen] = useState(false);
  const [isDeleteRoomDialogOpen, setIsDeleteRoomDialogOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<ChatRoom | null>(null);

  // Subscribe to the current room's message array only — subscribing to the
  // whole `roomMessages` map re-rendered the open Chats window whenever a
  // realtime message arrived in ANY room. Message arrays are replaced
  // immutably in the store, so reference equality is the correct signal.
  const currentRoomMessages = useChatsStore((state) =>
    state.currentRoomId
      ? state.roomMessages[state.currentRoomId] ?? EMPTY_MESSAGES
      : EMPTY_MESSAGES
  );

  // Limit messages rendered initially for performance. Memoized so downstream
  // consumers get a stable array identity between unrelated re-renders.
  const currentRoomMessagesLimited = useMemo(
    () => currentRoomMessages.slice(-messageRenderLimit),
    [currentRoomMessages, messageRenderLimit]
  );

  // --- Pusher Setup ---
  const initializePusher = useCallback(() => {
    if (pusherRef.current) return;

    console.log("[Pusher Hook] Getting singleton Pusher client...");
    pusherRef.current = getPusherClient();

    // Reconnect handling (channel resubscription) lives in the realtime
    // client itself; here we only observe state via the shared observable.
    connectionStateUnsubscribeRef.current = subscribeRealtimeConnection(
      (state) => {
        if (state === "connected") {
          console.log("[Pusher Hook] Connected to Pusher");
        }
      }
    );

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

    const channelName = getChatsGlobalChannelName(username);

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
    (roomId: string, roomType?: string | null) => {
      if (!pusherRef.current || roomChannelsRef.current[roomId]) return;

      const roomChannelName = getChatRoomChannelName(roomId, roomType);
      console.log(`[Pusher Hook] Subscribing to room channel: ${roomChannelName}`);
      const roomChannel = subscribePusherChannel(roomChannelName);

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

          const messageWithTimestamp = {
            ...data.message,
            timestamp: normalizeChatTimestamp(data.message.timestamp),
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
      `[Pusher Hook] Unsubscribing from room channel: ${channel.name}`
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

      const previousRoom = currentRoomId
        ? rooms.find((room) => room.id === currentRoomId)
        : null;

      await switchRoom(newRoomId);

      if (previousRoom?.type === "irc" && currentRoomId) {
        unsubscribeFromRoomChannel(currentRoomId);
      }

      const nextRoom = newRoomId
        ? rooms.find((room) => room.id === newRoomId)
        : null;
      if (
        nextRoom &&
        shouldSubscribeToForegroundRoomUpdates(nextRoom, newRoomId)
      ) {
        subscribeToRoomChannel(nextRoom.id, nextRoom.type);
      }

      return { hadUnreads };
    },
    [
      currentRoomId,
      rooms,
      switchRoom,
      subscribeToRoomChannel,
      unsubscribeFromRoomChannel,
    ]
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
      ircOptions: CreateRoomIrcOptions = {}
    ) => {
      if (!username) return { ok: false, error: "Set a username first." };

      if (type === "public" && !isAdmin) {
        return {
          ok: false,
          error: "Permission denied. Admin access required.",
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
      const getInitialRoomIds = () =>
        useChatsStore
          .getState()
          .rooms.slice(0, 5)
          .map((room) => room.id);

      const fetchInitialMessages = async (roomIds: string[]) => {
        if (roomIds.length === 0) return null;

        console.log(
          `[useChatRoom] Initial bulk fetch of messages for ${roomIds.length} rooms`
        );
        return fetchBulkMessages(roomIds);
      };

      const cachedRoomIds = getInitialRoomIds();
      const roomsPromise = fetchRooms();
      const cachedMessagesPromise = fetchInitialMessages(cachedRoomIds);
      const [roomsResult, cachedBulkResult] = await Promise.all([
        roomsPromise,
        cachedMessagesPromise,
      ]);

      const bulkResult =
        cachedBulkResult ??
        (roomsResult.ok ? await fetchInitialMessages(getInitialRoomIds()) : null);

      // For experienced users, don't recalculate unreads on reload - only track new messages going forward
      if (bulkResult?.ok) {
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
    })();
  }, [isWindowOpen, initializePusher, fetchRooms, fetchBulkMessages]);

  // Handle username changes
  useEffect(() => {
    if (!isWindowOpen) return;

    subscribeToGlobalChannel();
  }, [isWindowOpen, username, subscribeToGlobalChannel]);

  // Maintain subscriptions for visible rooms; IRC rooms are live only while open.
  useEffect(() => {
    if (!isWindowOpen) return;

    const visibleRoomsById = new Map(rooms.map((room) => [room.id, room]));

    rooms.forEach((room) => {
      if (shouldSubscribeToForegroundRoomUpdates(room, currentRoomId)) {
        subscribeToRoomChannel(room.id, room.type);
      }
    });

    Object.keys(roomChannelsRef.current).forEach((roomId) => {
      const room = visibleRoomsById.get(roomId);
      if (
        !room ||
        !shouldSubscribeToForegroundRoomUpdates(room, currentRoomId)
      ) {
        unsubscribeFromRoomChannel(roomId);
      }
    });
  }, [
    isWindowOpen,
    rooms,
    currentRoomId,
    subscribeToRoomChannel,
    unsubscribeFromRoomChannel,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[Pusher Hook] Cleaning up...");

      // Unsubscribe from all room channels
      unsubscribeAllRoomChannels();

      // Unsubscribe from global channel
      unsubscribeGlobalChannel();

      // Stop observing connection-state changes
      connectionStateUnsubscribeRef.current?.();
      connectionStateUnsubscribeRef.current = null;

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
