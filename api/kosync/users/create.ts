/**
 * POST /api/kosync/users/create
 *
 * Register kosync credentials. The client sends `password` as MD5(plain),
 * matching the official KOReader sync protocol. Username should match the
 * ryOS account so progress bridges into the Books app.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import {
  getKosyncAuthKey,
  setKosyncAuthKey,
} from "./_helpers/_auth.js";
import { KosyncErrorCode, sendKosyncError } from "./_helpers/_errors.js";
import {
  isValidKosyncField,
  isValidKosyncKeyField,
} from "./_helpers/_md5.js";
import { KOSYNC_CORS_HEADERS } from "./_helpers/_types.js";

interface CreateBody {
  username?: string;
  password?: string;
}

export default apiHandler(
  {
    methods: ["POST"],
    auth: "none",
    parseJsonBody: true,
    allowMissingOrigin: true,
    corsHeaders: KOSYNC_CORS_HEADERS,
  },
  async ({ req, res, redis, logger, startTime, body }) => {
    try {
      const ip = getClientIp(req);
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey(["rl", "kosync", "create", "ip", ip]),
        windowSeconds: 60 * 60,
        limit: 20,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          code: KosyncErrorCode.INTERNAL,
          message: "Too many registration attempts.",
        });
        return;
      }
    } catch (error) {
      logger.error("kosync create rate limit failed", error);
    }

    const payload = (body || {}) as CreateBody;
    if (
      !isValidKosyncKeyField(payload.username) ||
      !isValidKosyncField(payload.password)
    ) {
      sendKosyncError(res, KosyncErrorCode.INVALID_FIELDS);
      return;
    }

    // KOReader usernames are case-sensitive on the wire, but ryOS accounts are
    // lowercase — normalize so Books bridging finds the matching sync user.
    const username = payload.username.toLowerCase();
    const password = payload.password;

    // MD5 hex is 32 chars; reject obviously wrong payloads.
    if (!/^[a-f0-9]{32}$/i.test(password)) {
      sendKosyncError(res, KosyncErrorCode.INVALID_FIELDS);
      return;
    }

    try {
      const existing = await getKosyncAuthKey(redis, username);
      if (existing) {
        sendKosyncError(res, KosyncErrorCode.USER_EXISTS);
        return;
      }

      await setKosyncAuthKey(redis, username, password.toLowerCase());
      logger.info("kosync user created", { username });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ username });
    } catch (error) {
      logger.error("kosync user create failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
    }
  }
);
