import { apiHandler } from "../../_utils/api-handler.js";
import { unlinkTelegramAccountByUsername } from "../../_utils/telegram-link.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
  },
  async ({ res, redis, user, logger, startTime }) => {
    const username = user?.username || "";
    await unlinkTelegramAccountByUsername(redis, username);

    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  }
);
