import type { AIChatMessage, ChatMessage, ChatRoom } from "@/types/chat";

const MIN_CHAT_FONT_SIZE = 10;
const MAX_CHAT_FONT_SIZE = 24;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toValidDate = (value: unknown): Date => {
  const date =
    value instanceof Date
      ? value
      : new Date(
          typeof value === "string" || typeof value === "number"
            ? value
            : Date.now()
        );

  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const normalizeMessageParts = (
  parts: unknown,
  legacyContent: unknown
): AIChatMessage["parts"] => {
  if (Array.isArray(parts)) {
    return parts.filter(
      (part): part is AIChatMessage["parts"][number] =>
        isPlainObject(part) && typeof part.type === "string"
    );
  }

  if (typeof legacyContent === "string" && legacyContent.length > 0) {
    return [{ type: "text", text: legacyContent }] as AIChatMessage["parts"];
  }

  return [];
};

export const normalizePersistedAiMessage = (
  value: unknown
): AIChatMessage | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : null;
  const role = typeof value.role === "string" ? value.role : null;

  if (!id || !role) {
    return null;
  }

  const metadata = isPlainObject(value.metadata) ? value.metadata : {};

  return {
    ...value,
    id,
    role,
    parts: normalizeMessageParts(value.parts, value.content),
    metadata: {
      ...metadata,
      createdAt: toValidDate(metadata.createdAt),
    },
  } as AIChatMessage;
};

export const normalizePersistedAiMessages = (
  value: unknown
): AIChatMessage[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((message) => normalizePersistedAiMessage(message))
    .filter((message): message is AIChatMessage => message !== null);
};

const normalizePersistedRoom = (value: unknown): ChatRoom | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : null;
  const name = typeof value.name === "string" ? value.name : null;

  if (!id || !name) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "number" && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();
  const userCount =
    typeof value.userCount === "number" && Number.isFinite(value.userCount)
      ? value.userCount
      : 0;

  return {
    ...value,
    id,
    name,
    createdAt,
    userCount,
    type:
      value.type === "public" || value.type === "private"
        ? value.type
        : undefined,
    users: Array.isArray(value.users)
      ? value.users.filter(
          (user): user is string => typeof user === "string" && user.length > 0
        )
      : undefined,
    members: Array.isArray(value.members)
      ? value.members.filter(
          (member): member is string =>
            typeof member === "string" && member.length > 0
        )
      : undefined,
  };
};

export const normalizePersistedRooms = (value: unknown): ChatRoom[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((room) => normalizePersistedRoom(room))
    .filter((room): room is ChatRoom => room !== null);
};

const normalizePersistedRoomMessage = (value: unknown): ChatMessage | null => {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id : null;
  const roomId = typeof value.roomId === "string" ? value.roomId : null;
  const username = typeof value.username === "string" ? value.username : null;
  const content = typeof value.content === "string" ? value.content : null;

  if (!id || !roomId || !username || content === null) {
    return null;
  }

  const timestamp = new Date(
    typeof value.timestamp === "string" || typeof value.timestamp === "number"
      ? value.timestamp
      : Date.now()
  ).getTime();

  return {
    id,
    roomId,
    username,
    content,
    clientId:
      typeof value.clientId === "string" ? value.clientId : undefined,
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
};

export const normalizePersistedRoomMessages = (
  value: unknown
): Record<string, ChatMessage[]> => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([roomId, messages]) => [
      roomId,
      Array.isArray(messages)
        ? messages
            .map((message) => normalizePersistedRoomMessage(message))
            .filter((message): message is ChatMessage => message !== null)
        : [],
    ])
  );
};

export const normalizeUnreadCounts = (
  value: unknown
): Record<string, number> => {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([roomId, count]) =>
      typeof count === "number" && Number.isFinite(count)
        ? [[roomId, Math.max(0, Math.floor(count))]]
        : []
    )
  );
};

export const normalizeChatFontSize = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 13;
  }

  return Math.min(MAX_CHAT_FONT_SIZE, Math.max(MIN_CHAT_FONT_SIZE, value));
};

export const sanitizePersistedChatsState = (
  value: unknown,
  fallbackAiMessages: AIChatMessage[]
) => {
  const state = isPlainObject(value) ? value : {};
  const normalizedAiMessages = normalizePersistedAiMessages(state.aiMessages);

  return {
    aiMessages: normalizedAiMessages ?? fallbackAiMessages,
    username: typeof state.username === "string" ? state.username : null,
    hasPassword:
      typeof state.hasPassword === "boolean" ? state.hasPassword : null,
    currentRoomId:
      typeof state.currentRoomId === "string" ? state.currentRoomId : null,
    isSidebarVisible:
      typeof state.isSidebarVisible === "boolean" ? state.isSidebarVisible : true,
    isChannelsOpen:
      typeof state.isChannelsOpen === "boolean" ? state.isChannelsOpen : true,
    isPrivateOpen:
      typeof state.isPrivateOpen === "boolean" ? state.isPrivateOpen : true,
    rooms: normalizePersistedRooms(state.rooms),
    roomMessages: normalizePersistedRoomMessages(state.roomMessages),
    unreadCounts: normalizeUnreadCounts(state.unreadCounts),
    hasEverUsedChats:
      typeof state.hasEverUsedChats === "boolean"
        ? state.hasEverUsedChats
        : false,
    fontSize: normalizeChatFontSize(state.fontSize),
  };
};
