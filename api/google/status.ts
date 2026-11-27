import { apiHandler } from "../_utils/api-handler.js";
import { getUserPasswordHash } from "../_utils/auth/_password.js";
import {
  getLinkedGoogleAccountByUsername,
  isGoogleOAuthConfigured,
  toPublicGoogleAccount,
} from "../_utils/google-oauth.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "optional",
    allowExpiredAuth: false,
  },
  async ({ res, redis, logger, startTime, user }) => {
    const configured = isGoogleOAuthConfigured();
    // Per-user link state. Without this, browsers (Safari in particular)
    // heuristically cache the GET and keep serving the pre-consent payload.
    res.setHeader("Cache-Control", "private, no-store");
    if (!user?.username) {
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        configured,
        linked: false,
        account: null,
      });
      return;
    }

    const [account, passwordHash] = await Promise.all([
      getLinkedGoogleAccountByUsername(redis, user.username),
      getUserPasswordHash(redis, user.username),
    ]);

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      configured,
      linked: Boolean(account),
      hasPassword: Boolean(passwordHash),
      account: account ? toPublicGoogleAccount(account) : null,
    });
  }
);
