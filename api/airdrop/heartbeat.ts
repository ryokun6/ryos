import { apiHandler } from "../_utils/api-handler.js";
import { createRedis } from "../_utils/redis.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const AIRDROP_PRESENCE_KEY = "airdrop:presence";
const AIRDROP_PRESENCE_TTL_SECONDS = 60;

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ res, user }) => {
    const username = user!.username;
    const redis = createRedis();

    await redis.zadd(AIRDROP_PRESENCE_KEY, {
      score: Date.now(),
      member: username,
    });

    res.status(200).json({ success: true });
  }
);

export { AIRDROP_PRESENCE_KEY, AIRDROP_PRESENCE_TTL_SECONDS };
