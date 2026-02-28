import {
  isProfaneUsername,
  assertValidUsername,
} from "../_utils/_validation.js";
import {
  createRedisClient,
  generateSessionId,
  getCurrentTimestamp,
  setSession,
  getActiveSessionIds,
  getSession,
} from "../listen/_helpers/_redis.js";
import { LISTEN_SESSION_MAX_USERS } from "../listen/_helpers/_constants.js";
import type {
  CreateSessionRequest,
  ListenSession,
} from "../listen/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ListenSessionSummary {
  id: string;
  hostUsername: string;
  djUsername: string;
  createdAt: number;
  currentTrackMeta: {
    title: string;
    artist?: string;
    cover?: string;
  } | null;
  isPlaying: boolean;
  listenerCount: number;
}

interface ListenSessionsCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  body: unknown;
  onUserJoined?: (sessionId: string, username: string) => Promise<void>;
}

async function handleGetSessions(): Promise<CoreResponse> {
  try {
    const sessionIds = await getActiveSessionIds();
    const sessions: ListenSessionSummary[] = [];
    const now = Date.now();
    const STALE_THRESHOLD_MS = 30 * 60 * 1000;

    const sessionPromises = sessionIds.map(async (id) => {
      const session = await getSession(id);
      if (!session) return null;

      const isStale = now - session.lastSyncAt > STALE_THRESHOLD_MS;
      if (isStale) return null;

      const listenerCount =
        session.users.length + (session.anonymousListeners?.length ?? 0);
      return {
        id: session.id,
        hostUsername: session.hostUsername,
        djUsername: session.djUsername,
        createdAt: session.createdAt,
        currentTrackMeta: session.currentTrackMeta,
        isPlaying: session.isPlaying,
        listenerCount,
      } as ListenSessionSummary;
    });

    const results = await Promise.all(sessionPromises);
    for (const session of results) {
      if (session) sessions.push(session);
    }

    sessions.sort((a, b) => {
      if (b.listenerCount !== a.listenerCount) {
        return b.listenerCount - a.listenerCount;
      }
      return b.createdAt - a.createdAt;
    });

    return { status: 200, body: { sessions } };
  } catch {
    return { status: 500, body: { error: "Failed to list sessions" } };
  }
}

async function handleCreateSession(
  body: unknown,
  onUserJoined?: (sessionId: string, username: string) => Promise<void>
): Promise<CoreResponse> {
  const payload = body as CreateSessionRequest;
  const username = payload?.username?.toLowerCase();

  if (!username) {
    return { status: 400, body: { error: "Username is required" } };
  }

  try {
    assertValidUsername(username, "listen-session-create");
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Invalid username" },
    };
  }

  if (isProfaneUsername(username)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  const redis = createRedisClient();
  const userData = await redis.get(`chat:users:${username}`);
  if (!userData) {
    return { status: 404, body: { error: "User not found" } };
  }

  if (LISTEN_SESSION_MAX_USERS < 1) {
    return { status: 400, body: { error: "Session capacity unavailable" } };
  }

  const sessionId = generateSessionId();
  const now = getCurrentTimestamp();

  const session: ListenSession = {
    id: sessionId,
    hostUsername: username,
    djUsername: username,
    createdAt: now,
    currentTrackId: null,
    currentTrackMeta: null,
    isPlaying: false,
    positionMs: 0,
    lastSyncAt: now,
    users: [
      {
        username,
        joinedAt: now,
        isOnline: true,
      },
    ],
    anonymousListeners: [],
  };

  try {
    await setSession(sessionId, session);
    if (onUserJoined) {
      await onUserJoined(sessionId, username);
    }
    return { status: 201, body: { session } };
  } catch {
    return { status: 500, body: { error: "Failed to create session" } };
  }
}

export async function executeListenSessionsCore(
  input: ListenSessionsCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (input.method === "GET") {
    return handleGetSessions();
  }
  if (input.method === "POST") {
    return handleCreateSession(input.body, input.onUserJoined);
  }
  return { status: 405, body: { error: "Method not allowed" } };
}
