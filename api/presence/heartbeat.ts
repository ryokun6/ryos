/**
 * POST /api/presence/heartbeat
 * Global online presence heartbeat (authenticated). Keeps the user in the
 * online ZSET and broadcasts on the global presence channel.
 *
 * GET /api/presence/heartbeat
 * Returns online users (authenticated only).
 */

import { apiHandler } from "../_utils/api-handler.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";
import { GLOBAL_PRESENCE_CHANNEL } from "../../src/shared/constants/realtime.js";
import { redisKeys } from "../../src/shared/redisKeys.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const GLOBAL_PRESENCE_TTL_SECONDS = 90;

export default apiHandler(
  { methods: ["GET", "POST"], auth: "required" },
  async ({ req, res, redis, user }) => {
    if (req.method === "POST") {
      const username = user!.username;
      const now = Date.now();

      await redis.zadd(redisKeys.presence.globalOnline(), {
        score: now,
        member: username,
      });

      // Broadcast to the global presence channel
      await triggerRealtimeEvent(GLOBAL_PRESENCE_CHANNEL, "user-heartbeat", {
        username,
        timestamp: now,
      }).catch(() => {});

      res.status(200).json({ success: true });
      return;
    }

    // GET: return online users (authenticated)
    const cutoff = Date.now() - GLOBAL_PRESENCE_TTL_SECONDS * 1000;
    const canonicalPresenceKey = redisKeys.presence.globalOnline();
    await redis.zremrangebyscore(canonicalPresenceKey, 0, cutoff);
    const online: string[] = await redis.zrange(canonicalPresenceKey, 0, -1);
    const onlineUsers: string[] = [...new Set(online)];

    res.status(200).json({ users: onlineUsers });
  }
);

export { GLOBAL_PRESENCE_TTL_SECONDS, GLOBAL_PRESENCE_CHANNEL };
