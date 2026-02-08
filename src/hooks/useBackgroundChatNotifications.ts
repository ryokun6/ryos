import { useCallback, useEffect, useRef } from "react";
import { type PusherChannel, getPusherClient } from "@/lib/pusherClient";
import { useChatsStoreShallow } from "@/stores/helpers";
import { useChatsStore } from "@/stores/useChatsStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ChatMessage, ChatRoom } from "@/types/chat";
import { toast } from "sonner";
import { openChatRoomFromNotification } from "@/utils/openChatRoomFromNotification";
import { removeChatRoomById, upsertChatRoom } from "@/utils/chatRoomList";

const getGlobalChannelName = (username?: string | null): string =>
  username
    ? `chats-${username.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "_")}`
    : "chats-public";

const decodeHtmlEntities = (str: string): string => {
  if (!str) return str;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const textArea = document.createElement("textarea");
    textArea.innerHTML = str;
    return textArea.value;
  }

  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
};

const toTimestamp = (value: string | number): number =>
  typeof value === "string" || typeof value === "number"
    ? new Date(value).getTime()
    : Date.now();

const isChatsAppOpen = (): boolean => {
  const { instances } = useAppStore.getState();
  return Object.values(instances).some(
    (instance) => instance.appId === "chats" && instance.isOpen
  );
};

interface RoomMessagePayload {
  message: ChatMessage;
}

interface MessageDeletedPayload {
  roomId: string;
  messageId: string;
}

interface GlobalHandlers {
  onRoomCreated: (data: { room: ChatRoom }) => void;
  onRoomDeleted: (data: { roomId: string }) => void;
  onRoomUpdated: (data: { room: ChatRoom }) => void;
  onRoomsUpdated: (data: { rooms: ChatRoom[] }) => void;
}

interface RoomHandlers {
  onRoomMessage: (data: RoomMessagePayload) => void;
  onMessageDeleted: (data: MessageDeletedPayload) => void;
}

export function useBackgroundChatNotifications() {
  const {
    username,
    authToken,
    rooms,
    fetchRooms,
    setRooms,
    addMessageToRoom,
    removeMessageFromRoom,
    incrementUnread,
  } = useChatsStoreShallow((state) => ({
    username: state.username,
    authToken: state.authToken,
    rooms: state.rooms,
    fetchRooms: state.fetchRooms,
    setRooms: state.setRooms,
    addMessageToRoom: state.addMessageToRoom,
    removeMessageFromRoom: state.removeMessageFromRoom,
    incrementUnread: state.incrementUnread,
  }));

  const hasOpenChatsInstance = useAppStore((state) =>
    Object.values(state.instances).some(
      (instance) => instance.appId === "chats" && instance.isOpen
    )
  );

  const isBackgroundMode = Boolean(username && authToken && !hasOpenChatsInstance);

  const pusherRef = useRef<ReturnType<typeof getPusherClient> | null>(null);
  const globalChannelRef = useRef<PusherChannel | null>(null);
  const globalHandlersRef = useRef<GlobalHandlers | null>(null);
  const roomChannelsRef = useRef<Record<string, PusherChannel>>({});
  const roomHandlersRef = useRef<Record<string, RoomHandlers>>({});

  const unsubscribeGlobalChannel = useCallback(() => {
    const channel = globalChannelRef.current;
    const handlers = globalHandlersRef.current;

    if (channel && handlers) {
      channel.unbind("room-created", handlers.onRoomCreated);
      channel.unbind("room-deleted", handlers.onRoomDeleted);
      channel.unbind("room-updated", handlers.onRoomUpdated);
      channel.unbind("rooms-updated", handlers.onRoomsUpdated);
    }

    if (channel && pusherRef.current) {
      pusherRef.current.unsubscribe(channel.name);
    }

    globalChannelRef.current = null;
    globalHandlersRef.current = null;
  }, []);

  const unsubscribeFromRoomChannel = useCallback((roomId: string) => {
    const channel = roomChannelsRef.current[roomId];
    const handlers = roomHandlersRef.current[roomId];

    if (channel && handlers) {
      channel.unbind("room-message", handlers.onRoomMessage);
      channel.unbind("message-deleted", handlers.onMessageDeleted);
    }

    if (channel && pusherRef.current) {
      pusherRef.current.unsubscribe(`room-${roomId}`);
    }

    delete roomChannelsRef.current[roomId];
    delete roomHandlersRef.current[roomId];
  }, []);

  const unsubscribeAllChannels = useCallback(() => {
    unsubscribeGlobalChannel();
    Object.keys(roomChannelsRef.current).forEach((roomId) => {
      unsubscribeFromRoomChannel(roomId);
    });
  }, [unsubscribeGlobalChannel, unsubscribeFromRoomChannel]);

  const handleRoomMessage = useCallback(
    (data: RoomMessagePayload) => {
      if (!data?.message?.roomId || !data.message.id) {
        return;
      }

      const { roomMessages: roomMessagesMap } = useChatsStore.getState();
      const existingMessages = roomMessagesMap[data.message.roomId] || [];
      if (existingMessages.some((message) => message.id === data.message.id)) {
        return;
      }

      const messageWithTimestamp: ChatMessage = {
        ...data.message,
        timestamp: toTimestamp(data.message.timestamp),
      };

      addMessageToRoom(messageWithTimestamp.roomId, messageWithTimestamp);

      // Skip toast/unread updates if Chats is already open; the in-app listener handles those.
      if (isChatsAppOpen()) {
        return;
      }

      incrementUnread(messageWithTimestamp.roomId);

      const decoded = decodeHtmlEntities(String(messageWithTimestamp.content || ""));
      const preview = decoded.replace(/\s+/g, " ").trim().slice(0, 80);

      toast(`@${messageWithTimestamp.username}`, {
        id: `chat-room-message-${messageWithTimestamp.id}`,
        description: preview,
        action: {
          label: "Open",
          onClick: () => {
            openChatRoomFromNotification(messageWithTimestamp.roomId);
          },
        },
      });
    },
    [addMessageToRoom, incrementUnread]
  );

  const handleMessageDeleted = useCallback(
    (data: MessageDeletedPayload) => {
      if (!data?.roomId || !data.messageId) {
        return;
      }
      removeMessageFromRoom(data.roomId, data.messageId);
    },
    [removeMessageFromRoom]
  );

  const subscribeToGlobalChannel = useCallback(() => {
    if (!pusherRef.current) return;

    const channelName = getGlobalChannelName(username);
    if (
      globalChannelRef.current &&
      globalChannelRef.current.name !== channelName
    ) {
      unsubscribeGlobalChannel();
    }

    if (globalChannelRef.current) {
      return;
    }

    const channel = pusherRef.current.subscribe(channelName);
    const handlers: GlobalHandlers = {
      onRoomCreated: (data) => {
        if (!data?.room?.id) {
          void fetchRooms();
          return;
        }

        const { rooms: currentRooms } = useChatsStore.getState();
        setRooms(upsertChatRoom(currentRooms, data.room));
      },
      onRoomDeleted: (data) => {
        if (!data?.roomId) {
          void fetchRooms();
          return;
        }

        const { rooms: currentRooms } = useChatsStore.getState();
        setRooms(removeChatRoomById(currentRooms, data.roomId));
      },
      onRoomUpdated: (data) => {
        if (!data?.room?.id) {
          void fetchRooms();
          return;
        }

        const { rooms: currentRooms } = useChatsStore.getState();
        setRooms(upsertChatRoom(currentRooms, data.room));
      },
      onRoomsUpdated: (data) => {
        if (!Array.isArray(data?.rooms)) {
          void fetchRooms();
          return;
        }
        setRooms(data.rooms);
      },
    };

    channel.bind("room-created", handlers.onRoomCreated);
    channel.bind("room-deleted", handlers.onRoomDeleted);
    channel.bind("room-updated", handlers.onRoomUpdated);
    channel.bind("rooms-updated", handlers.onRoomsUpdated);

    globalChannelRef.current = channel;
    globalHandlersRef.current = handlers;
  }, [fetchRooms, setRooms, username, unsubscribeGlobalChannel]);

  const subscribeToRoomChannel = useCallback(
    (roomId: string) => {
      if (!roomId || !pusherRef.current || roomChannelsRef.current[roomId]) {
        return;
      }

      const channel = pusherRef.current.subscribe(`room-${roomId}`);
      const handlers: RoomHandlers = {
        onRoomMessage: handleRoomMessage,
        onMessageDeleted: handleMessageDeleted,
      };

      channel.bind("room-message", handlers.onRoomMessage);
      channel.bind("message-deleted", handlers.onMessageDeleted);

      roomChannelsRef.current[roomId] = channel;
      roomHandlersRef.current[roomId] = handlers;
    },
    [handleMessageDeleted, handleRoomMessage]
  );

  useEffect(() => {
    if (!isBackgroundMode) {
      unsubscribeAllChannels();
      return;
    }

    if (!pusherRef.current) {
      pusherRef.current = getPusherClient();
    }

    subscribeToGlobalChannel();
    void fetchRooms();

    return () => {
      unsubscribeAllChannels();
    };
  }, [fetchRooms, isBackgroundMode, subscribeToGlobalChannel, unsubscribeAllChannels]);

  useEffect(() => {
    if (!isBackgroundMode) {
      return;
    }

    rooms.forEach((room) => {
      subscribeToRoomChannel(room.id);
    });

    Object.keys(roomChannelsRef.current).forEach((roomId) => {
      const stillVisible = rooms.some((room) => room.id === roomId);
      if (!stillVisible) {
        unsubscribeFromRoomChannel(roomId);
      }
    });
  }, [isBackgroundMode, rooms, subscribeToRoomChannel, unsubscribeFromRoomChannel]);
}
