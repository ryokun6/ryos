import { useCallback, useEffect, useRef } from "react";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ChatMessage } from "@/types/chat";
import { removeChatRoomById, upsertChatRoom } from "@/utils/chatRoomList";
import { shouldNotifyForRoomMessage } from "@/utils/chatNotifications";
import { showRoomMessageNotification } from "@/utils/chatNotificationDisplay";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { shouldSubscribeToBackgroundRoomUpdates } from "@/utils/chatRoomSubscriptions";
import {
  ChatRealtimeService,
  normalizeRealtimeChatMessage,
  type MessageDeletedPayload,
  type RoomMessagePayload,
} from "@/services/chat/ChatRealtimeService";

const isChatsAppOpen = (): boolean => {
  const { instances } = useAppStore.getState();
  return Object.values(instances).some(
    (instance) => instance.appId === "chats" && instance.isOpen
  );
};

export function useBackgroundChatNotifications() {
  const {
    username,
    isAuthenticated,
    rooms,
    fetchRooms,
    setRooms,
    addMessageToRoom,
    removeMessageFromRoom,
    incrementUnread,
  } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
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

  const isBackgroundMode = Boolean(username && isAuthenticated && !hasOpenChatsInstance);

  const realtimeRef = useRef<ChatRealtimeService | null>(null);
  const getRealtime = useCallback(() => {
    realtimeRef.current ??= new ChatRealtimeService();
    return realtimeRef.current;
  }, []);

  const unsubscribeAllChannels = useCallback(() => {
    realtimeRef.current?.unsubscribeAll();
  }, []);

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

      const messageWithTimestamp: ChatMessage = normalizeRealtimeChatMessage(data.message);

      addMessageToRoom(messageWithTimestamp.roomId, messageWithTimestamp);

      const { currentRoomId } = useChatsStore.getState();
      const chatsOpen = isChatsAppOpen();

      if (
        !shouldNotifyForRoomMessage({
          chatsOpen,
          currentRoomId,
          messageRoomId: messageWithTimestamp.roomId,
        })
      ) {
        return;
      }

      incrementUnread(messageWithTimestamp.roomId);

      const decoded = decodeHtmlEntities(String(messageWithTimestamp.content || ""));
      showRoomMessageNotification({
        username: messageWithTimestamp.username,
        content: decoded,
        roomId: messageWithTimestamp.roomId,
        messageId: messageWithTimestamp.id,
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

  useEffect(() => {
    if (!isBackgroundMode) {
      unsubscribeAllChannels();
      return;
    }

    const realtime = getRealtime();
    realtime.subscribeGlobal(username, {
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
    });
    void fetchRooms();

    return () => {
      unsubscribeAllChannels();
    };
  }, [fetchRooms, getRealtime, isBackgroundMode, setRooms, unsubscribeAllChannels, username]);

  useEffect(() => {
    if (!isBackgroundMode) {
      return;
    }

    const backgroundRoomsById = new Map(
      rooms
        .filter(shouldSubscribeToBackgroundRoomUpdates)
        .map((room) => [room.id, room])
    );

    backgroundRoomsById.forEach((room) => {
      getRealtime().subscribeRoom(
        room.id,
        {
          onRoomMessage: handleRoomMessage,
          onMessageDeleted: handleMessageDeleted,
        },
        room.type
      );
    });

    const realtime = realtimeRef.current;
    if (!realtime) return;
    realtime
      .getSubscribedRoomIds()
      .filter((roomId) => !backgroundRoomsById.has(roomId))
      .forEach((roomId) => {
        realtime.unsubscribeRoom(roomId);
      });
  }, [getRealtime, handleMessageDeleted, handleRoomMessage, isBackgroundMode, rooms]);
}
