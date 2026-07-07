import { apiHandler } from "../_utils/api-handler.js";
import {
  getTelegramHeartbeatSettings,
  setTelegramHeartbeatInstructions,
} from "../_utils/telegram-heartbeat.js";

interface TelegramHeartbeatSettingsBody {
  instructions?: unknown;
}

export default apiHandler<TelegramHeartbeatSettingsBody>(
  {
    methods: ["GET", "POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ req, res, redis, user, body, logger, startTime }) => {
    const username = user?.username || "";

    if ((req.method || "GET").toUpperCase() === "POST") {
      const settings = await setTelegramHeartbeatInstructions(
        redis,
        username,
        body?.instructions
      );
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ settings });
      return;
    }

    const settings = await getTelegramHeartbeatSettings(redis, username);
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ settings });
  }
);
