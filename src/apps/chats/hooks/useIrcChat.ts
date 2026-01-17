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

  const connect = useCallback(async () => {
    const nick = buildNick(username);
    lastNickRef.current = nick;

    try {
      const response = await fetch("/api/irc/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nick, channels: [DEFAULT_CHANNEL] }),
      });
      if (!response.ok) {
        throw new Error("Failed to connect to IRC");
      }
      const data = await response.json();
      setSessionId(data.sessionId);
      if (data.channels?.length > 0) {
        setCurrentRoomId(data.channels[0]);
      }
    } catch (error) {
      toast.error("IRC Connection Failed", {
        description: "Unable to connect to the IRC server.",
      });
      console.error("[IRC] Connection error:", error);
    }
  }, [username]);

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

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/irc/stream?sessionId=${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const payload = JSON.parse(event.data) as IrcStreamEvent;
      if (payload.type === "state") {
        setConnectionState(payload.payload.state);
        refreshChannels();
        return;
      }
      if (payload.type === "system") {
        const text = payload.payload.text;
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
        if (currentRoomId && chatMessage.roomId !== currentRoomId) {
          incrementUnread(chatMessage.roomId);
        }
      }
    };

    eventSource.onerror = () => {
      setConnectionState((prev) =>
        prev ? { ...prev, connected: false } : prev
      );
    };

    return () => {
      eventSource.close();
    };
  }, [
    isWindowOpen,
    sessionId,
    currentRoomId,
    incrementUnread,
    refreshChannels,
  ]);

  useEffect(() => {
    if (username && lastNickRef.current && username !== lastNickRef.current) {
      setSessionId(null);
      setChannels([]);
      setMessagesByRoom({});
      setCurrentRoomId(null);
    }
  }, [username]);

  const handleRoomSelect = useCallback(
    async (roomId: string | null) => {
      setCurrentRoomId(roomId);
      if (roomId) {
        clearUnread(roomId);
      }
      return { hadUnreads: false };
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
        toast.error("Failed to send message", {
          description: "The IRC server did not accept the message.",
        });
      }
    },
    [sessionId, currentRoomId]
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
        return { ok: false, error: "Failed to join channel." };
      }
      await refreshChannels();
      const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
      setCurrentRoomId(normalized);
      return { ok: true };
    },
    [sessionId, refreshChannels]
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
      toast.error("Failed to leave channel");
    }
  }, [roomToDelete, sessionId, currentRoomId, refreshChannels]);

  const currentRoomMessages = currentRoomId
    ? messagesByRoom[currentRoomId] || []
    : [];

  const currentRoomMessagesLimited = currentRoomId
    ? currentRoomMessages.slice(-messageRenderLimit)
    : [];

  const isConnected = connectionState?.connected ?? false;
  const ircNick = connectionState?.nick ?? lastNickRef.current ?? username ?? null;

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
