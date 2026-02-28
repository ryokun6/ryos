import { ROOM_ID_REGEX } from "../_utils/_validation.js";
import { roomExists, getMessages } from "../rooms/_helpers/_redis.js";
import type { Message } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface MessagesBulkCoreInput {
  originAllowed: boolean;
  roomIdsParam: string | undefined;
}

export async function executeMessagesBulkCore(
  input: MessagesBulkCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.roomIdsParam) {
    return { status: 400, body: { error: "roomIds query parameter is required" } };
  }

  const roomIds = input.roomIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (roomIds.length === 0) {
    return { status: 400, body: { error: "At least one room ID is required" } };
  }

  for (const id of roomIds) {
    if (!ROOM_ID_REGEX.test(id)) {
      return { status: 400, body: { error: "Invalid room ID format" } };
    }
  }

  try {
    const roomExistenceChecks = await Promise.all(roomIds.map((roomId) => roomExists(roomId)));
    const validRoomIds = roomIds.filter((_, index) => roomExistenceChecks[index]);
    const invalidRoomIds = roomIds.filter((_, index) => !roomExistenceChecks[index]);

    const messagePromises = validRoomIds.map(async (roomId) => {
      const messages = await getMessages(roomId, 20);
      return { roomId, messages };
    });

    const results = await Promise.all(messagePromises);
    const messagesMap: Record<string, Message[]> = {};
    results.forEach(({ roomId, messages }) => {
      messagesMap[roomId] = messages;
    });

    return { status: 200, body: { messagesMap, validRoomIds, invalidRoomIds } };
  } catch {
    return { status: 500, body: { error: "Failed to fetch bulk messages" } };
  }
}
