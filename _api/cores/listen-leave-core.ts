import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../_utils/_validation.js";
import {
  getCurrentTimestamp,
  getSession,
  setSession,
  deleteSession,
} from "../listen/_helpers/_redis.js";
import type { LeaveSessionRequest } from "../listen/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ListenLeaveCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  sessionId: string | undefined;
  body: unknown;
  onDjChanged?: (
    sessionId: string,
    payload: { previousDj: string; newDj: string }
  ) => Promise<void>;
  onSessionEnded?: (sessionId: string) => Promise<void>;
  onUserLeft?: (
    sessionId: string,
    payload: { username: string }
  ) => Promise<void>;
}

export async function executeListenLeaveCore(
  input: ListenLeaveCoreInput
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

  const body = input.body as LeaveSessionRequest;
  const username = body?.username?.toLowerCase();
  const anonymousId = body?.anonymousId;

  if (!username && !anonymousId) {
    return { status: 400, body: { error: "Username or anonymousId is required" } };
  }

  try {
    assertValidRoomId(input.sessionId, "listen-leave");
    if (username) {
      assertValidUsername(username, "listen-leave");
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
    const session = await getSession(input.sessionId);
    if (!session) {
      return { status: 404, body: { error: "Session not found" } };
    }

    if (username) {
      if (session.hostUsername === username) {
        await deleteSession(input.sessionId);
        if (input.onSessionEnded) {
          await input.onSessionEnded(input.sessionId);
        }
        return { status: 200, body: { success: true } };
      }

      const userIndex = session.users.findIndex((user) => user.username === username);
      const wasDj = session.djUsername === username;
      const userExisted = userIndex !== -1;

      if (userIndex !== -1) {
        session.users.splice(userIndex, 1);
      }

      if (wasDj) {
        const nextDj = session.users.sort((a, b) => a.joinedAt - b.joinedAt)[0]?.username;
        if (nextDj) {
          const previousDj = session.djUsername;
          session.djUsername = nextDj;
          if (input.onDjChanged) {
            await input.onDjChanged(input.sessionId, { previousDj, newDj: nextDj });
          }
        }
      }

      session.lastSyncAt = getCurrentTimestamp();
      session.users.sort((a, b) => a.joinedAt - b.joinedAt);
      await setSession(input.sessionId, session);

      if (userExisted && input.onUserLeft) {
        await input.onUserLeft(input.sessionId, { username });
      }

      return { status: 200, body: { success: true, session } };
    }

    if (!session.anonymousListeners) {
      session.anonymousListeners = [];
    }

    const listenerIndex = session.anonymousListeners.findIndex(
      (listener) => listener.anonymousId === anonymousId
    );

    if (listenerIndex !== -1) {
      session.anonymousListeners.splice(listenerIndex, 1);
    }

    session.lastSyncAt = getCurrentTimestamp();
    await setSession(input.sessionId, session);

    return { status: 200, body: { success: true } };
  } catch {
    return { status: 500, body: { error: "Failed to leave session" } };
  }
}
