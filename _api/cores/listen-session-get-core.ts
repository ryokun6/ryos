import { assertValidRoomId } from "../_utils/_validation.js";
import { getSession, touchSession } from "../listen/_helpers/_redis.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface ListenSessionGetCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  sessionId: string | undefined;
}

export async function executeListenSessionGetCore(
  input: ListenSessionGetCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.sessionId) {
    return { status: 400, body: { error: "Session ID is required" } };
  }

  try {
    assertValidRoomId(input.sessionId, "listen-session-get");
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Invalid session ID" },
    };
  }

  if (input.method !== "GET") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

  try {
    const session = await getSession(input.sessionId);
    if (!session) {
      return { status: 404, body: { error: "Session not found" } };
    }

    await touchSession(input.sessionId);
    return { status: 200, body: { session } };
  } catch {
    return { status: 500, body: { error: "Failed to fetch session" } };
  }
}
