import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatRoom } from "@/types/chat";
import type {
  IrcChannel,
  IrcConnectionState,
  IrcMessage,
  IrcStreamEvent,
} from "@/types/irc";
import { useChatsStore } from "@/stores/useChatsStore";
import { toast } from "@/hooks/useToast";

const DEFAULT_CHANNEL = "#ryos";

const formatIrcMessageContent = (message: IrcMessage) => {
  switch (message.type) {
    case "join":
    case "part":
    case "nick":
    case "topic":
      return message.content;
    case "notice":
      return `[notice] ${message.content}`;
    default:
      return message.content;
  }
};

const mapIrcMessageToChatMessage = (message: IrcMessage): ChatMessage => ({
  id: message.id,
  roomId: message.channel,
  username: message.nick,
  content: formatIrcMessageContent(message),
  timestamp: message.timestamp,
});

const mapChannelToRoom = (channel: IrcChannel): ChatRoom => ({
  id: channel.name,
  name: channel.name.replace(/^#/, ""),
  type: "public",
  createdAt: Date.now(),
  userCount: channel.userCount ?? channel.users.length,
  users: channel.users,
});

const buildNick = (username?: string | null) => {
  if (username && username.trim().length > 0) return username;
  const suffix = Math.floor(Math.random() * 10000);
  return `ryos_guest_${suffix}`;
};

export function useIrcChat(isWindowOpen: boolean) {
  const username = useChatsStore((state) => state.username);
  const messageRenderLimit = useChatsStore((state) => state.messageRenderLimit);
  const isSidebarVisible = useChatsStore((state) => state.isSidebarVisible);
  const toggleSidebarVisibility = useChatsStore(
    (state) => state.toggleSidebarVisibility
  );
  const incrementUnread = useChatsStore((state) => state.incrementUnread);
  const clearUnread = useChatsStore((state) => state.clearUnread);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<IrcConnectionState | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const pendingReconnectToastRef = useRef(false);
  const [channels, setChannels] = useState<IrcChannel[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [isNewRoomDialogOpen, setIsNewRoomDialogOpen] = useState(false);
  const [isDeleteRoomDialogOpen, setIsDeleteRoomDialogOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<ChatRoom | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastNickRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allowReconnectRef = useRef(true);
  const currentRoomIdRef = useRef<string | null>(null);

  const rooms = useMemo(() => channels.map(mapChannelToRoom), [channels]);

  const refreshChannels = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await fetch(`/api/irc/channels?sessionId=${sessionId}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (Array.isArray(data.channels)) {
        setChannels(data.channels);
      }
    } catch (error) {
      console.error("[IRC] Failed to fetch channels:", error);
    }
  }, [sessionId]);

  const handleSessionMissing = useCallback(() => {
    toast("IRC session expired. Reconnecting...");
    setConnectionError(true);
    setConnectionState(null);
    setSessionId(null);
  }, []);

  const connect = useCallback(async () => {
    const nick = buildNick(username);
    lastNickRef.current = nick;

    try {
      setConnectionError(false);
      const channelsToJoin =
        channels.length > 0 ? channels.map((channel) => channel.name) : [DEFAULT_CHANNEL];
      const response = await fetch("/api/irc/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nick, channels: channelsToJoin }),
      });
      if (!response.ok) {
        throw new Error("Failed to connect to IRC");
      }
      const data = await response.json();
      setSessionId(data.sessionId);
      const nextRoom =
        currentRoomId && channelsToJoin.includes(currentRoomId)
          ? currentRoomId
          : data.channels?.[0] || null;
      setCurrentRoomId(nextRoom);
      setConnectionError(false);
      if (pendingReconnectToastRef.current) {
        toast.success("IRC reconnected");
        pendingReconnectToastRef.current = false;
      }
      reconnectAttemptRef.current = 0;
    } catch (error) {
      toast.error("IRC Connection Failed", {
        description: "Unable to connect to the IRC server.",
      });
      setConnectionError(true);
      console.error("[IRC] Connection error:", error);
    }
  }, [username, channels, currentRoomId]);

  useEffect(() => {
    if (!isWindowOpen) return;
    if (!sessionId) {
      connect();
      return;
    }
    return undefined;
  }, [isWindowOpen, sessionId, connect]);

  useEffect(() => {
    if (!isWindowOpen || !sessionId) return;

    allowReconnectRef.current = true;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `/api/irc/stream?sessionId=${sessionId}`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnectionError(false);
      reconnectAttemptRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as IrcStreamEvent;
      if (payload.type === "state") {
        const statePayload = payload.payload as { state: IrcConnectionState };
        setConnectionState(statePayload.state);
        if (statePayload.state.connected) {
          setConnectionError(false);
        }
        refreshChannels();
        return;
      }
      if (payload.type === "system") {
        const systemPayload = payload.payload as { text: string };
        const text = systemPayload.text;
        if (text) {
          toast(text);
        }
        return;
      }
      if (payload.type === "message") {
        const message = payload.payload as IrcMessage;
        const chatMessage = mapIrcMessageToChatMessage(message);
        setMessagesByRoom((prev) => {
          const existing = prev[chatMessage.roomId] || [];
          return {
            ...prev,
            [chatMessage.roomId]: [...existing, chatMessage],
          };
        });
        const activeRoom = currentRoomIdRef.current;
        if (!activeRoom || chatMessage.roomId !== activeRoom) {
          incrementUnread(chatMessage.roomId);
        }
      }
    };

    eventSource.onerror = () => {
      if (!allowReconnectRef.current) {
        return;
      }
      setConnectionState((prev) =>
        prev ? { ...prev, connected: false } : prev
      );
      setConnectionError(true);
      if (!pendingReconnectToastRef.current) {
        toast("Reconnecting to IRC…");
        pendingReconnectToastRef.current = true;
      }
      eventSource.close();
      if (!reconnectTimeoutRef.current) {
        reconnectAttemptRef.current += 1;
        const delay = Math.min(
          30000,
          1000 * 2 ** reconnectAttemptRef.current
        );
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          setConnectionState(null);
          setSessionId(null);
        }, delay);
      }
    };

    return () => {
      allowReconnectRef.current = false;
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [
    isWindowOpen,
    sessionId,
    incrementUnread,
    refreshChannels,
  ]);

  useEffect(() => {
    currentRoomIdRef.current = currentRoomId;
  }, [currentRoomId]);

  useEffect(() => {
    if (username && lastNickRef.current && username !== lastNickRef.current) {
      setSessionId(null);
      setChannels([]);
      setMessagesByRoom({});
      setCurrentRoomId(null);
      setConnectionState(null);
    }
  }, [username]);

  const handleRoomSelect = useCallback(
    async (roomId: string | null) => {
      const { unreadCounts } = useChatsStore.getState();
      const hadUnreads = roomId ? (unreadCounts[roomId] || 0) > 0 : false;
      setCurrentRoomId(roomId);
      if (roomId) {
        clearUnread(roomId);
      }
      return { hadUnreads };
    },
    [clearUnread]
  );

  const sendRoomMessage = useCallback(
    async (content: string) => {
      if (!sessionId || !currentRoomId || !content.trim()) return;
      const response = await fetch("/api/irc/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          channel: currentRoomId,
          content: content.trim(),
        }),
      });
      if (!response.ok) {
        if (response.status === 404) {
          handleSessionMissing();
        } else {
          toast.error("Failed to send message", {
            description: "The IRC server did not accept the message.",
          });
        }
      }
    },
    [sessionId, currentRoomId, handleSessionMissing]
  );

  const handleAddRoom = useCallback(
    async (roomName: string) => {
      if (!sessionId) {
        return { ok: false, error: "Not connected to IRC yet." };
      }
      const trimmed = roomName.trim();
      if (!trimmed) {
        return { ok: false, error: "Channel name is required." };
      }
      const response = await fetch("/api/irc/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          channel: trimmed,
        }),
      });
      if (!response.ok) {
        if (response.status === 404) {
          handleSessionMissing();
        }
        return { ok: false, error: "Failed to join channel." };
      }
      await refreshChannels();
      const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
      setCurrentRoomId(normalized);
      return { ok: true };
    },
    [sessionId, refreshChannels, handleSessionMissing]
  );

  const promptAddRoom = useCallback(() => {
    setIsNewRoomDialogOpen(true);
  }, []);

  const promptDeleteRoom = useCallback((room: ChatRoom) => {
    setRoomToDelete(room);
    setIsDeleteRoomDialogOpen(true);
  }, []);

  const confirmDeleteRoom = useCallback(async () => {
    if (!roomToDelete || !sessionId) return;
    const response = await fetch("/api/irc/part", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        channel: roomToDelete.id,
      }),
    });
    if (response.ok) {
      if (currentRoomId === roomToDelete.id) {
        setCurrentRoomId(null);
      }
      setIsDeleteRoomDialogOpen(false);
      setRoomToDelete(null);
      refreshChannels();
    } else {
      if (response.status === 404) {
        handleSessionMissing();
      } else {
        toast.error("Failed to leave channel");
      }
    }
  }, [
    roomToDelete,
    sessionId,
    currentRoomId,
    refreshChannels,
    handleSessionMissing,
  ]);

  const currentRoomMessages = currentRoomId
    ? messagesByRoom[currentRoomId] || []
    : [];

  const currentRoomMessagesLimited = currentRoomId
    ? currentRoomMessages.slice(-messageRenderLimit)
    : [];

  const isConnected = connectionState?.connected ?? false;
  const ircNick = connectionState?.nick ?? lastNickRef.current ?? username ?? null;
  const connectionStatus: "connected" | "connecting" | "disconnected" =
    isConnected ? "connected" : connectionError ? "disconnected" : "connecting";

  return {
    username,
    ircNick,
    authToken: null,
    rooms,
    currentRoomId,
    currentRoomMessages,
    currentRoomMessagesLimited,
    isSidebarVisible,
    isAdmin: false,
    isConnected,
    connectionStatus,
    handleRoomSelect,
    sendRoomMessage,
    toggleSidebarVisibility,
    handleAddRoom: (
      roomName: string,
      _type?: "public" | "private",
      _members?: string[]
    ) => handleAddRoom(roomName),
    promptAddRoom,
    promptDeleteRoom,
    isNewRoomDialogOpen,
    setIsNewRoomDialogOpen,
    isDeleteRoomDialogOpen,
    setIsDeleteRoomDialogOpen,
    roomToDelete,
    confirmDeleteRoom,
  };
}
