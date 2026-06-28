import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useAppStore } from "@/stores/useAppStore";
import type { ChatMessage } from "@/types/chat";
import { removeChatRoomById, upsertChatRoom } from "@/utils/chatRoomList";
import { shouldNotifyForRoomMessage } from "@/utils/chatNotifications";
import { showRoomMessageNotification } from "@/utils/chatNotificationDisplay";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { shouldSubscribeToBackgroundRoomUpdates } from "@/utils/chatRoomSubscriptions";
import { openChatRoomFromNotification } from "@/utils/openChatRoomFromNotification";
import {
  getAppPublicOrigin,
  getPusherRuntimeConfig,
  getRealtimeProvider,
  getRealtimeWebSocketUrl,
} from "@/utils/runtimeConfig";
import type {
  DesktopChatNotificationConfig,
  DesktopChatNotificationRendererMode,
  DesktopChatNotificationState,
} from "@/utils/desktopChatNotificationPolicy";
import {
  getDesktopChatNotificationRendererMode,
  shouldUseRendererChatNotificationFallback,
} from "@/utils/desktopChatNotificationPolicy";
import type { RyosDesktopChatNotificationEvent } from "@/types/ryos-desktop";
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

const getDesktopChatNotificationApi = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const desktop = window.ryosDesktop;
  if (!desktop?.configureChatNotifications) {
    return null;
  }
  return desktop;
};

const buildDesktopChatNotificationConfig =
  (): DesktopChatNotificationConfig => {
    const realtimeProvider = getRealtimeProvider();
    return {
      appPublicOrigin: getAppPublicOrigin(),
      realtimeProvider,
      websocketUrl: realtimeProvider === "local" ? getRealtimeWebSocketUrl() : null,
      pusher: realtimeProvider === "pusher" ? getPusherRuntimeConfig() : null,
    };
  };

export function useBackgroundChatNotifications() {
  const {
    rooms,
    currentRoomId,
    fetchRooms,
    setRooms,
    addMessageToRoom,
    removeMessageFromRoom,
    incrementUnread,
  } = useChatsStoreShallow((state) => ({
    rooms: state.rooms,
    currentRoomId: state.currentRoomId,
    fetchRooms: state.fetchRooms,
    setRooms: state.setRooms,
    addMessageToRoom: state.addMessageToRoom,
    removeMessageFromRoom: state.removeMessageFromRoom,
    incrementUnread: state.incrementUnread,
  }));
  const username = useAuthStore((state) => state.username);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const hasOpenChatsInstance = useAppStore((state) =>
    Object.values(state.instances).some(
      (instance) => instance.appId === "chats" && instance.isOpen
    )
  );

  const isBackgroundMode = Boolean(username && isAuthenticated && !hasOpenChatsInstance);
  const [desktopNotificationMode, setDesktopNotificationMode] = useState<
    DesktopChatNotificationRendererMode
  >("unknown");
  const isRendererBackgroundMode = shouldUseRendererChatNotificationFallback({
    isBackgroundMode,
    desktopNotificationMode,
  });

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

  const desktopState = useMemo<DesktopChatNotificationState>(
    () => ({
      username,
      isAuthenticated,
      chatsOpen: hasOpenChatsInstance,
      currentRoomId,
      rooms: rooms.map((room) => ({
        id: room.id,
        type: room.type,
      })),
    }),
    [currentRoomId, hasOpenChatsInstance, isAuthenticated, rooms, username]
  );
  const latestDesktopStateRef =
    useRef<DesktopChatNotificationState>(desktopState);

  useEffect(() => {
    latestDesktopStateRef.current = desktopState;
  }, [desktopState]);

  const handleDesktopNotificationEvent = useCallback(
    (event: RyosDesktopChatNotificationEvent) => {
      switch (event.type) {
        case "room-created": {
          const { rooms: currentRooms } = useChatsStore.getState();
          setRooms(upsertChatRoom(currentRooms, event.room));
          break;
        }
        case "room-deleted": {
          const { rooms: currentRooms } = useChatsStore.getState();
          setRooms(removeChatRoomById(currentRooms, event.roomId));
          break;
        }
        case "room-updated": {
          const { rooms: currentRooms } = useChatsStore.getState();
          setRooms(upsertChatRoom(currentRooms, event.room));
          break;
        }
        case "rooms-updated": {
          setRooms(event.rooms);
          break;
        }
        case "room-message": {
          const { roomMessages: roomMessagesMap } = useChatsStore.getState();
          const existingMessages =
            roomMessagesMap[event.message.roomId] || [];
          if (
            existingMessages.some((message) => message.id === event.message.id)
          ) {
            break;
          }

          const messageWithTimestamp: ChatMessage = normalizeRealtimeChatMessage(
            event.message
          );
          addMessageToRoom(messageWithTimestamp.roomId, messageWithTimestamp);

          const { currentRoomId: activeRoomId } = useChatsStore.getState();
          const shouldNotifyInRyOs = shouldNotifyForRoomMessage({
            chatsOpen: isChatsAppOpen(),
            currentRoomId: activeRoomId,
            messageRoomId: messageWithTimestamp.roomId,
          });

          if (event.incrementUnread || shouldNotifyInRyOs) {
            incrementUnread(messageWithTimestamp.roomId);
          }

          if (
            event.showInRenderer ||
            (shouldNotifyInRyOs && !event.showInMain)
          ) {
            const decoded = decodeHtmlEntities(
              String(messageWithTimestamp.content || "")
            );
            showRoomMessageNotification({
              username: messageWithTimestamp.username,
              content: decoded,
              roomId: messageWithTimestamp.roomId,
              messageId: messageWithTimestamp.id,
            });
          }
          break;
        }
        case "message-deleted": {
          removeMessageFromRoom(event.roomId, event.messageId);
          break;
        }
      }
    },
    [addMessageToRoom, incrementUnread, removeMessageFromRoom, setRooms]
  );

  useEffect(() => {
    const desktop = getDesktopChatNotificationApi();
    if (!desktop?.onOpenChatRoomFromNotification) {
      return;
    }

    return desktop.onOpenChatRoomFromNotification((roomId) => {
      openChatRoomFromNotification(roomId);
    });
  }, []);

  useEffect(() => {
    const desktop = getDesktopChatNotificationApi();
    if (!desktop?.onChatNotificationStatus) {
      return;
    }

    return desktop.onChatNotificationStatus((status) => {
      const mode = getDesktopChatNotificationRendererMode(status);
      if (mode) {
        setDesktopNotificationMode(mode);
      }
    });
  }, []);

  useEffect(() => {
    const desktop = getDesktopChatNotificationApi();
    if (!desktop?.onChatNotificationEvent) {
      return;
    }

    return desktop.onChatNotificationEvent(handleDesktopNotificationEvent);
  }, [handleDesktopNotificationEvent]);

  useEffect(() => {
    const desktop = getDesktopChatNotificationApi();
    if (!desktop?.configureChatNotifications) {
      setDesktopNotificationMode("renderer");
      return;
    }

    if (!username || !isAuthenticated) {
      setDesktopNotificationMode("renderer");
      void desktop.stopChatNotifications?.();
      return;
    }

    let cancelled = false;
    setDesktopNotificationMode("unknown");
    void desktop
      .configureChatNotifications(
        buildDesktopChatNotificationConfig(),
        latestDesktopStateRef.current
      )
      .then((result) => {
        if (cancelled) return;
        setDesktopNotificationMode(
          getDesktopChatNotificationRendererMode(result) ?? "renderer"
        );
      })
      .catch(() => {
        if (cancelled) return;
        setDesktopNotificationMode("renderer");
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, username]);

  useEffect(() => {
    if (desktopNotificationMode !== "managed") {
      return;
    }

    const desktop = getDesktopChatNotificationApi();
    if (!desktop?.updateChatNotificationState) {
      return;
    }

    void desktop
      .updateChatNotificationState(desktopState)
      .then((result) => {
        if (getDesktopChatNotificationRendererMode(result) !== "managed") {
          setDesktopNotificationMode("renderer");
        }
      })
      .catch(() => {
        setDesktopNotificationMode("renderer");
      });
  }, [desktopNotificationMode, desktopState]);

  useEffect(() => {
    if (isBackgroundMode) {
      void fetchRooms();
    }
  }, [fetchRooms, isBackgroundMode]);

  useEffect(() => {
    if (!isRendererBackgroundMode) {
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
  }, [fetchRooms, getRealtime, isRendererBackgroundMode, setRooms, unsubscribeAllChannels, username]);

  useEffect(() => {
    if (!isRendererBackgroundMode) {
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
  }, [getRealtime, handleMessageDeleted, handleRoomMessage, isRendererBackgroundMode, rooms]);
}
