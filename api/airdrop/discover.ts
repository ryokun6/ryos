import { apiHandler } from "../_utils/api-handler.js";
import { createRedis } from "../_utils/redis.js";
import {
  AIRDROP_PRESENCE_KEY,
  AIRDROP_PRESENCE_TTL_SECONDS,
} from "./heartbeat.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  { methods: ["GET"], auth: "required" },
  async ({ res, user }) => {
    const username = user!.username;
    const redis = createRedis();

    const cutoff = Date.now() - AIRDROP_PRESENCE_TTL_SECONDS * 1000;
    await redis.zremrangebyscore(AIRDROP_PRESENCE_KEY, 0, cutoff);

    const onlineUsers: string[] = await redis.zrange(
      AIRDROP_PRESENCE_KEY,
      0,
      -1
    );

    const nearbyUsers = onlineUsers.filter((u) => u !== username);

    res.status(200).json({ users: nearbyUsers });
  }
);
