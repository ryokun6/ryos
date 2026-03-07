import { apiHandler } from "../../_utils/api-handler.js";
import { getLinkedTelegramAccountByUsername } from "../../_utils/telegram-link.js";

export const runtime = "nodejs";
export const maxDuration = 10;

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ res, redis, user, logger, startTime }) => {
    const username = user?.username || "";
    const linkedAccount = await getLinkedTelegramAccountByUsername(redis, username);

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      linked: !!linkedAccount,
      account: linkedAccount
        ? {
            telegramUserId: linkedAccount.telegramUserId,
            telegramUsername: linkedAccount.telegramUsername,
            firstName: linkedAccount.firstName,
            lastName: linkedAccount.lastName,
            linkedAt: linkedAccount.linkedAt,
          }
        : null,
    });
  }
);
