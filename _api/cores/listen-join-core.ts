import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../_utils/_validation.js";
import {
  createRedisClient,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../listen/_helpers/_redis.js";
import { LISTEN_SESSION_MAX_USERS } from "../listen/_helpers/_constants.js";
import type {
  JoinSessionRequest,
  ListenSessionUser,
  ListenAnonymousListener,
} from "../listen/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

const MAX_ANONYMOUS_LISTENERS = 50;

interface ListenJoinCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  sessionId: string | undefined;
  body: unknown;
  onUserJoined?: (sessionId: string, username: string) => Promise<void>;
}

export async function executeListenJoinCore(
  input: ListenJoinCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (input.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  if (!input.sessionId) {
    return { status: 400, body: { error: "Session ID is required" } };
  }

  const body = input.body as JoinSessionRequest;
  const username = body?.username?.toLowerCase();
  const anonymousId = body?.anonymousId;

  if (!username && !anonymousId) {
    return { status: 400, body: { error: "Username or anonymousId is required" } };
  }

  try {
    assertValidRoomId(input.sessionId, "listen-join");
    if (username) {
      assertValidUsername(username, "listen-join");
    }
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Validation error" },
    };
  }

  if (username && isProfaneUsername(username)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  try {
    const redis = createRedisClient();

    if (username) {
      const [session, userData] = await Promise.all([
        getSession(input.sessionId),
        redis.get(`chat:users:${username}`),
      ]);

      if (!session) {
        return { status: 404, body: { error: "Session not found" } };
      }

      if (!userData) {
        return { status: 404, body: { error: "User not found" } };
      }

      const now = getCurrentTimestamp();
      const existingIndex = session.users.findIndex((user) => user.username === username);
      let shouldBroadcast = false;

      if (existingIndex === -1) {
        if (session.users.length >= LISTEN_SESSION_MAX_USERS) {
          return { status: 403, body: { error: "Session is full" } };
        }

        const newUser: ListenSessionUser = {
          username,
          joinedAt: now,
          isOnline: true,
        };
        session.users.push(newUser);
        shouldBroadcast = true;
      } else {
        const existingUser = session.users[existingIndex];
        if (!existingUser.isOnline) {
          shouldBroadcast = true;
        }
        session.users[existingIndex] = {
          ...existingUser,
          isOnline: true,
        };
      }

      session.lastSyncAt = now;
      session.users.sort((a, b) => a.joinedAt - b.joinedAt);
      await setSession(input.sessionId, session);

      if (shouldBroadcast && input.onUserJoined) {
        await input.onUserJoined(input.sessionId, username);
      }

      return { status: 200, body: { session } };
    }

    const session = await getSession(input.sessionId);
    if (!session) {
      return { status: 404, body: { error: "Session not found" } };
    }

    if (!session.anonymousListeners) {
      session.anonymousListeners = [];
    }

    const now = getCurrentTimestamp();
    const existingIndex = session.anonymousListeners.findIndex(
      (listener) => listener.anonymousId === anonymousId
    );

    if (existingIndex === -1) {
      if (session.anonymousListeners.length >= MAX_ANONYMOUS_LISTENERS) {
        return { status: 403, body: { error: "Too many listeners" } };
      }

      const newListener: ListenAnonymousListener = {
        anonymousId: anonymousId!,
        joinedAt: now,
      };
      session.anonymousListeners.push(newListener);
    }

    session.lastSyncAt = now;
    await setSession(input.sessionId, session);

    return { status: 200, body: { session } };
  } catch {
    return { status: 500, body: { error: "Failed to join session" } };
  }
}
