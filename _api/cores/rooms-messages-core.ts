import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import {
  isProfaneUsername,
  assertValidRoomId,
  escapeHTML,
  filterProfanityPreservingUrls,
  MAX_MESSAGE_LENGTH,
} from "../_utils/_validation.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_MESSAGES_PREFIX,
  CHAT_USERS_PREFIX,
  CHAT_BURST_PREFIX,
  CHAT_BURST_SHORT_WINDOW_SECONDS,
  CHAT_BURST_SHORT_LIMIT,
  CHAT_BURST_LONG_WINDOW_SECONDS,
  CHAT_BURST_LONG_LIMIT,
  CHAT_MIN_INTERVAL_SECONDS,
  USER_EXPIRATION_TIME,
  CHAT_ROOM_PRESENCE_ZSET_PREFIX,
} from "../rooms/_helpers/_constants.js";
import { ensureUserExists } from "../rooms/_helpers/_users.js";
import type { Message, Room, User } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsMessagesCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  roomId: string | undefined;
  queryLimit: string | undefined;
  body: unknown;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  onNewMessage?: (roomId: string, message: Message, roomData: Room) => Promise<void>;
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getCurrentTimestamp(): number {
  return Date.now();
}

function parseJSON<T>(data: unknown): T | null {
  if (!data) return null;
  if (typeof data === "object") return data as T;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}

async function roomExists(roomId: string): Promise<boolean> {
  const redis = createRedis();
  const exists = await redis.exists(`${CHAT_ROOM_PREFIX}${roomId}`);
  return exists === 1;
}

async function getRoom(roomId: string): Promise<Room | null> {
  const redis = createRedis();
  const data = await redis.get(`${CHAT_ROOM_PREFIX}${roomId}`);
  return parseJSON<Room>(data);
}

async function getMessages(roomId: string, limit: number = 20): Promise<Message[]> {
  const redis = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const rawMessages = await redis.lrange<(Message | string)[]>(
    messagesKey,
    0,
    limit - 1
  );
  return (rawMessages || [])
    .map((item) => parseJSON<Message>(item))
    .filter((msg): msg is Message => msg !== null);
}

async function addMessage(roomId: string, message: Message): Promise<void> {
  const redis = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  await redis.lpush(messagesKey, JSON.stringify(message));
  await redis.ltrim(messagesKey, 0, 99);
}

async function getLastMessage(roomId: string): Promise<Message | null> {
  const redis = createRedis();
  const messagesKey = `${CHAT_MESSAGES_PREFIX}${roomId}`;
  const lastMessages = await redis.lrange<(Message | string)[]>(messagesKey, 0, 0);
  if (!lastMessages || lastMessages.length === 0) return null;
  return parseJSON<Message>(lastMessages[0]);
}

async function setUser(username: string, user: User): Promise<void> {
  const redis = createRedis();
  await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify(user));
}

async function refreshRoomPresence(roomId: string, username: string): Promise<void> {
  const redis = createRedis();
  const zkey = `${CHAT_ROOM_PRESENCE_ZSET_PREFIX}${roomId}`;
  await redis.zadd(zkey, { score: Date.now(), member: username });
}

export async function executeRoomsMessagesCore(
  input: RoomsMessagesCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.roomId) {
    return { status: 400, body: { error: "Room ID is required" } };
  }

  try {
    assertValidRoomId(input.roomId, "messages-operation");
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : "Invalid room ID" },
    };
  }

  if (input.method === "GET") {
    try {
      const exists = await roomExists(input.roomId);
      if (!exists) {
        return { status: 404, body: { error: "Room not found" } };
      }

      const limit = input.queryLimit
        ? Math.min(parseInt(input.queryLimit, 10) || 20, 500)
        : 20;
      const messages = await getMessages(input.roomId, limit);

      return { status: 200, body: { messages, _meta: { count: messages.length } } };
    } catch {
      return { status: 500, body: { error: "Failed to fetch messages" } };
    }
  }

  if (input.method === "POST") {
    const token = input.authHeader?.startsWith("Bearer ")
      ? input.authHeader.slice(7)
      : null;

    if (!token || !input.usernameHeader) {
      return { status: 401, body: { error: "Unauthorized - missing credentials" } };
    }

    const authResult = await validateAuth(createRedis(), input.usernameHeader, token, {});
    if (!authResult.valid) {
      return { status: 401, body: { error: "Unauthorized - invalid token" } };
    }

    const username = input.usernameHeader.toLowerCase();
    if (isProfaneUsername(username)) {
      return { status: 401, body: { error: "Unauthorized" } };
    }

    const originalContent = (input.body as { content?: unknown })?.content;
    if (!originalContent || typeof originalContent !== "string") {
      return { status: 400, body: { error: "Content is required" } };
    }
    const content = escapeHTML(filterProfanityPreservingUrls(originalContent));

    const roomData = await getRoom(input.roomId);
    if (!roomData) {
      return { status: 404, body: { error: "Room not found" } };
    }
    const isPublicRoom = !roomData.type || roomData.type === "public";

    if (isPublicRoom) {
      try {
        const redis = createRedis();
        const shortKey = `${CHAT_BURST_PREFIX}s:${input.roomId}:${username}`;
        const longKey = `${CHAT_BURST_PREFIX}l:${input.roomId}:${username}`;
        const lastKey = `${CHAT_BURST_PREFIX}last:${input.roomId}:${username}`;

        const shortCount = await redis.incr(shortKey);
        if (shortCount === 1) {
          await redis.expire(shortKey, CHAT_BURST_SHORT_WINDOW_SECONDS);
        }
        if (shortCount > CHAT_BURST_SHORT_LIMIT) {
          return {
            status: 429,
            body: { error: "You're sending messages too quickly." },
          };
        }

        const longCount = await redis.incr(longKey);
        if (longCount === 1) {
          await redis.expire(longKey, CHAT_BURST_LONG_WINDOW_SECONDS);
        }
        if (longCount > CHAT_BURST_LONG_LIMIT) {
          return { status: 429, body: { error: "Too many messages. Please wait." } };
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const lastSent = await redis.get<string>(lastKey);
        if (lastSent) {
          const delta = nowSeconds - parseInt(lastSent);
          if (delta < CHAT_MIN_INTERVAL_SECONDS) {
            return {
              status: 429,
              body: { error: "Please wait before sending another message." },
            };
          }
        }
        await redis.set(lastKey, nowSeconds, {
          ex: CHAT_BURST_LONG_WINDOW_SECONDS,
        });
      } catch {
        // Fail open on rate limiter errors to match current behavior.
      }
    }

    try {
      let userData;
      try {
        userData = await ensureUserExists(username, "send-message");
        if (!userData) {
          return { status: 500, body: { error: "Failed to verify user" } };
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Username contains inappropriate language"
        ) {
          return {
            status: 400,
            body: { error: "Username contains inappropriate language" },
          };
        }
        return { status: 500, body: { error: "Failed to verify user" } };
      }

      if (content.length > MAX_MESSAGE_LENGTH) {
        return {
          status: 400,
          body: { error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` },
        };
      }

      const lastMsg = await getLastMessage(input.roomId);
      if (lastMsg && lastMsg.username === username && lastMsg.content === content) {
        return { status: 400, body: { error: "Duplicate message detected" } };
      }

      const message: Message = {
        id: generateId(),
        roomId: input.roomId,
        username,
        content,
        timestamp: getCurrentTimestamp(),
      };

      await addMessage(input.roomId, message);
      const updatedUser = { ...userData, lastActive: getCurrentTimestamp() };
      await setUser(username, updatedUser);
      await createRedis().expire(`chat:users:${username}`, USER_EXPIRATION_TIME);
      await refreshRoomPresence(input.roomId, username);

      if (input.onNewMessage) {
        await input.onNewMessage(input.roomId, message, roomData);
      }
      return {
        status: 201,
        body: {
          message,
          _meta: { roomId: input.roomId, username, messageId: message.id },
        },
      };
    } catch {
      return { status: 500, body: { error: "Failed to send message" } };
    }
  }

  return { status: 405, body: { error: "Method not allowed" } };
}
