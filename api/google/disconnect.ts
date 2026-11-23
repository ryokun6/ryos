import { redisKeys } from "../../src/shared/redisKeys.js";
import { apiHandler } from "../_utils/api-handler.js";
import { unlinkGoogleAccountByUsername } from "../_utils/google-oauth.js";

export default apiHandler(
  {
    methods: ["POST"],
    auth: "required",
    allowExpiredAuth: false,
  },
  async ({ res, redis, logger, startTime, user }) => {
    const username = user?.username || "";
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const passwordHash = await redis.get<string>(
      redisKeys.auth.userPassword(username)
    );
    if (!passwordHash) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error:
          "Set a password in Security settings before disconnecting Google so you do not lose access to your account.",
        code: "PASSWORD_REQUIRED_BEFORE_DISCONNECT",
      });
      return;
    }

    await unlinkGoogleAccountByUsername(redis, username, {
      revokeRemoteToken: true,
    });

    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  }
);
