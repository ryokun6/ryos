import { apiHandler } from "../_utils/api-handler.js";
import { triggerRealtimeEvent } from "../_utils/realtime.js";
import { redisKeys } from "../../src/shared/redisKeys.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const AIRDROP_PRESENCE_TTL_SECONDS = 60;
const AIRDROP_LOBBY_CHANNEL = "airdrop-lobby";

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ res, user, redis }) => {
    const username = user!.username;

    const entry = {
      score: Date.now(),
      member: username,
    };
    await redis.zadd(redisKeys.presence.airdropLobby(), entry);

    // Broadcast presence to the shared lobby so other clients update instantly
    await triggerRealtimeEvent(AIRDROP_LOBBY_CHANNEL, "airdrop-presence", {
      username,
      timestamp: Date.now(),
    }).catch(() => {});

    res.status(200).json({ success: true });
  }
);

export { AIRDROP_PRESENCE_TTL_SECONDS, AIRDROP_LOBBY_CHANNEL };
