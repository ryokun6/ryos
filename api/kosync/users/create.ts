/**
 * POST /api/kosync/users/create
 *
 * KOReader "Register". Credentials are the ryOS account password:
 * the client sends `password` as MD5(plain). That MD5 is stored when the
 * user signs in / registers / changes password on ryOS. Register here
 * succeeds when the supplied MD5 already matches that key.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { getClientIp } from "../../_utils/_rate-limit.js";
import { getStoredUserRecord } from "../../_utils/auth/_user-record.js";
import { getKosyncAuthKey } from "../_helpers/_auth.js";
import { KosyncErrorCode, sendKosyncError } from "../_helpers/_errors.js";
import {
  isValidKosyncField,
  isValidKosyncKeyField,
} from "../_helpers/_md5.js";
import { KOSYNC_CORS_HEADERS } from "../_helpers/_types.js";

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

    const username = payload.username.toLowerCase();
    const password = payload.password.toLowerCase();

    if (!/^[a-f0-9]{32}$/i.test(password)) {
      sendKosyncError(res, KosyncErrorCode.INVALID_FIELDS);
      return;
    }

    try {
      const ryosUser = await getStoredUserRecord(redis, username);
      const existing = await getKosyncAuthKey(redis, username);

      if (!ryosUser || !existing) {
        res.status(403).json({
          code: KosyncErrorCode.REGISTRATION_DISABLED,
          message:
            "Sign in to ryOS once with this username, then use the same password here.",
        });
        return;
      }

      if (existing !== password) {
        sendKosyncError(res, KosyncErrorCode.UNAUTHORIZED);
        return;
      }

      // MD5 matches the ryOS password key — Register succeeds for KOReader.
      logger.info("kosync register matched ryOS password key", { username });
      logger.response(201, Date.now() - startTime);
      res.status(201).json({ username });
    } catch (error) {
      logger.error("kosync user create failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
    }
  }
);
