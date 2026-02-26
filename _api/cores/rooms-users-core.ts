import { assertValidRoomId } from "../_utils/_validation.js";
import { getActiveUsersAndPrune } from "../rooms/_helpers/_presence.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsUsersCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  roomId: string | undefined;
}

export async function executeRoomsUsersCore(
  input: RoomsUsersCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }
  if (input.method !== "GET") {
    return { status: 405, body: { error: "Method not allowed" } };
  }
  if (!input.roomId) {
    return { status: 400, body: { error: "Room ID is required" } };
  }

  try {
    assertValidRoomId(input.roomId, "get-room-users");
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : "Invalid room ID" },
    };
  }

  try {
    const users = await getActiveUsersAndPrune(input.roomId);
    return { status: 200, body: { users, _meta: { count: users.length } } };
  } catch {
    return { status: 500, body: { error: "Failed to get room users" } };
  }
}
