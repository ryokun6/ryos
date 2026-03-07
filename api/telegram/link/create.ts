import { apiHandler } from "../../_utils/api-handler.js";
import {
  createTelegramLinkCode,
  getLinkedTelegramAccountByUsername,
} from "../../_utils/telegram-link.js";
import {
  buildTelegramDeepLink,
  getTelegramBotUsername,
} from "../../_utils/telegram.js";
import * as RateLimit from "../../_utils/_rate-limit.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
  },
  async ({ res, redis, user, logger, startTime }) => {
    const username = user?.username || "";
    const rlKey = RateLimit.makeKey(["rl", "telegram", "link-create", username]);
    const rlResult = await RateLimit.checkCounterLimit({
      key: rlKey,
      windowSeconds: 10 * 60,
      limit: 5,
    });

    if (!rlResult.allowed) {
      logger.warn("Telegram link code rate limit exceeded", { username });
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "Too many link requests. Please try again later." });
      return;
    }

    const existingLink = await getLinkedTelegramAccountByUsername(redis, username);
    const { code, expiresIn } = await createTelegramLinkCode(redis, username);
    const botUsername = getTelegramBotUsername();
    const deepLink = buildTelegramDeepLink(botUsername, `link_${code}`);

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      code,
      expiresIn,
      botUsername,
      deepLink,
      linkedAccount: existingLink
        ? {
            telegramUserId: existingLink.telegramUserId,
            telegramUsername: existingLink.telegramUsername,
            firstName: existingLink.firstName,
            lastName: existingLink.lastName,
            linkedAt: existingLink.linkedAt,
          }
        : null,
    });
  }
);
