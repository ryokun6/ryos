/**
 * POST /api/presence/heartbeat
 * Global online presence heartbeat. Keeps the user in the online ZSET
 * and broadcasts their status on the global presence channel.
 *
 * GET /api/presence/heartbeat
 * Returns the list of currently online users.
 */

import { apiHandler } from "../_utils/api-handler.js";
import { createRedis } from "../_utils/redis.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const GLOBAL_PRESENCE_KEY = "ryos:presence:online";
const GLOBAL_PRESENCE_TTL_SECONDS = 90;
const GLOBAL_PRESENCE_CHANNEL = "presence-global";

export default apiHandler(
  { methods: ["GET", "POST"], auth: "optional" },
  async ({ req, res, user }) => {
    const redis = createRedis();

    if (req.method === "POST") {
      if (!user) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const username = user.username;
      const now = Date.now();

      await redis.zadd(GLOBAL_PRESENCE_KEY, { score: now, member: username });

      // Broadcast to the global presence channel
      await triggerRealtimeEvent(GLOBAL_PRESENCE_CHANNEL, "user-heartbeat", {
        username,
        timestamp: now,
      }).catch(() => {});

      res.status(200).json({ success: true });
      return;
    }

    // GET: return online users
    const cutoff = Date.now() - GLOBAL_PRESENCE_TTL_SECONDS * 1000;
    await redis.zremrangebyscore(GLOBAL_PRESENCE_KEY, 0, cutoff);
    const onlineUsers: string[] = await redis.zrange(GLOBAL_PRESENCE_KEY, 0, -1);

    res.status(200).json({ users: onlineUsers });
  }
);

export { GLOBAL_PRESENCE_KEY, GLOBAL_PRESENCE_TTL_SECONDS, GLOBAL_PRESENCE_CHANNEL };
