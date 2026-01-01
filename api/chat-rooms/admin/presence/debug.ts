import { handleRequest } from "../../_http.js";
import { redis } from "../../_redis.js";
import { getDetailedRooms } from "../../_presence.js";
import { CHAT_ROOM_PRESENCE_PREFIX } from "../../_constants.js";
import { extractAuth, validateAuth } from "../../../_utils/auth.js";
import { createErrorResponse } from "../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "admin:debugPresence",
    handler: async ({ requestId }) => {
      const { username, token } = extractAuth(request);
      const authResult = await validateAuth(username, token, requestId);
      if (!authResult.valid || username?.toLowerCase() !== "ryo") {
        return createErrorResponse("Unauthorized - Admin access required", 403);
      }

      try {
        const presenceKeys: string[] = [];
        let cursor = 0;

        do {
          const [newCursor, keys] = await redis.scan(cursor, {
            match: `${CHAT_ROOM_PRESENCE_PREFIX}*`,
            count: 100,
          });
          cursor = parseInt(String(newCursor));
          presenceKeys.push(...keys);
        } while (cursor !== 0);

        const presenceData: Record<string, { value: unknown; ttl: number }> = {};

        for (const key of presenceKeys) {
          const value = await redis.get(key);
          const ttl = await redis.ttl(key);
          presenceData[key] = { value, ttl };
        }

        const rooms = await getDetailedRooms();

        return new Response(
          JSON.stringify({
            presenceKeys: presenceKeys.length,
            presenceData,
            rooms: rooms.map((r) => ({
              id: r.id,
              name: r.name,
              userCount: r.userCount,
              users: r.users,
            })),
          }),
          {
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        return createErrorResponse("Debug failed", 500);
      }
    },
  });
}
