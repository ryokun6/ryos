import { apiHandler } from "../_utils/api-handler.js";
import { AIRDROP_PRESENCE_TTL_SECONDS } from "./heartbeat.js";
import { redisKeys } from "../../src/shared/redisKeys.js";

export default apiHandler(
  { methods: ["GET"], auth: "required" },
  async ({ res, user, redis }) => {
    const username = user!.username;

    const cutoff = Date.now() - AIRDROP_PRESENCE_TTL_SECONDS * 1000;
    const canonicalPresenceKey = redisKeys.presence.airdropLobby();
    await redis.zremrangebyscore(canonicalPresenceKey, 0, cutoff);

    const onlineUsers = await redis.zrange(canonicalPresenceKey, 0, -1);

    const nearbyUsers = onlineUsers.filter((u) => u !== username);

    res.status(200).json({ users: nearbyUsers });
  }
);
