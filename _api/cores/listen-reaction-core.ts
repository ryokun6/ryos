import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../_utils/_validation.js";
import {
  generateSessionId,
  getCurrentTimestamp,
  getSession,
  setSession,
} from "../listen/_helpers/_redis.js";
import type { ReactionRequest } from "../listen/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ListenReactionCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  sessionId: string | undefined;
  body: unknown;
  onReaction?: (
    sessionId: string,
    payload: { id: string; username: string; emoji: string; timestamp: number }
  ) => Promise<void>;
}

export async function executeListenReactionCore(
  input: ListenReactionCoreInput
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

  const body = input.body as ReactionRequest;
  const username = body?.username?.toLowerCase();
  const emoji = body?.emoji?.trim();

  if (!username) {
    return { status: 400, body: { error: "Username is required" } };
  }

  if (!emoji) {
    return { status: 400, body: { error: "Emoji is required" } };
  }

  if (emoji.length > 8) {
    return { status: 400, body: { error: "Emoji is too long" } };
  }

  try {
    assertValidUsername(username, "listen-reaction");
    assertValidRoomId(input.sessionId, "listen-reaction");
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Validation error" },
    };
  }

  if (isProfaneUsername(username)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  try {
    const session = await getSession(input.sessionId);
    if (!session) {
      return { status: 404, body: { error: "Session not found" } };
    }

    if (!session.users.some((user) => user.username === username)) {
      return { status: 403, body: { error: "User not in session" } };
    }

    const now = getCurrentTimestamp();
    const reactionId = generateSessionId();

    session.lastSyncAt = now;
    await setSession(input.sessionId, session);

    if (input.onReaction) {
      await input.onReaction(input.sessionId, {
        id: reactionId,
        username,
        emoji,
        timestamp: now,
      });
    }

    return { status: 200, body: { success: true } };
  } catch {
    return { status: 500, body: { error: "Failed to send reaction" } };
  }
}
