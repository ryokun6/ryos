/**
 * POST /api/push/register
 *
 * Register/upsert the signed-in user's iOS device for APNs pushes.
 * Body: { deviceToken: string (64 hex), appVersion?: string, rooms?: string[] }
 * Idempotent — the iOS app calls this on every foreground.
 */

import { z } from "zod";
import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import {
  MAX_ROOMS_PER_DEVICE,
  normalizeDeviceToken,
  registerPushDevice,
} from "../_utils/push-relay.js";
import { ROOM_ID_REGEX } from "../../src/shared/validation.js";

const optionsSchema = z.object({
  appVersion: z.string().trim().max(64).optional(),
  rooms: z
    .array(z.string().max(64).regex(ROOM_ID_REGEX))
    .max(MAX_ROOMS_PER_DEVICE)
    .optional(),
});

const REGISTER_RL_LIMIT = 60;
const REGISTER_RL_WINDOW_SECONDS = 60;

interface RegisterBody {
  deviceToken?: unknown;
  appVersion?: unknown;
  rooms?: unknown;
}

export default apiHandler<RegisterBody>(
  { methods: ["POST"], auth: "required", parseJsonBody: true },
  async ({ res, redis, logger, startTime, user, body }) => {
    const username = user!.username;

    const rl = await RateLimit.checkCounterLimit({
      key: RateLimit.makeKey(["rl", "push", "register", "user", username]),
      windowSeconds: REGISTER_RL_WINDOW_SECONDS,
      limit: REGISTER_RL_LIMIT,
    });
    if (!rl.allowed) {
      res.setHeader("Retry-After", String(rl.resetSeconds));
      logger.response(429, Date.now() - startTime);
      res.status(429).json({ error: "rate_limit_exceeded" });
      return;
    }

    const deviceToken = normalizeDeviceToken(body?.deviceToken);
    if (!deviceToken) {
      logger.warn("Invalid device token", { username });
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "invalid_device_token" });
      return;
    }

    const parsed = optionsSchema.safeParse({
      appVersion: body?.appVersion ?? undefined,
      rooms: body?.rooms ?? undefined,
    });
    if (!parsed.success) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "validation_error", issues: parsed.error.issues });
      return;
    }

    const device = await registerPushDevice(redis, {
      username,
      deviceToken,
      sessionToken: user!.token,
      appVersion: parsed.data.appVersion,
      rooms: parsed.data.rooms,
    });

    logger.info("Push device registered", {
      username,
      env: device.env,
      roomCount: device.rooms.length,
    });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ ok: true });
  }
);
