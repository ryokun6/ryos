/**
 * POST /api/push/unregister
 *
 * Delete the signed-in user's device row and its per-room watermarks.
 * Body: { deviceToken: string (64 hex) }
 */

import { apiHandler } from "../_utils/api-handler.js";
import { normalizeDeviceToken, unregisterPushDevice } from "../_utils/push-relay.js";

export default apiHandler<{ deviceToken?: unknown }>(
  { methods: ["POST"], auth: "required", parseJsonBody: true },
  async ({ res, redis, logger, startTime, user, body }) => {
    const deviceToken = normalizeDeviceToken(body?.deviceToken);
    if (!deviceToken) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_device_token" });
      return;
    }

    // Tokens owned by another account are left alone; respond ok either way.
    const removed = await unregisterPushDevice(redis, deviceToken, user!.username);
    logger.info("Push device unregistered", { username: user!.username, removed });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ ok: true });
  }
);
