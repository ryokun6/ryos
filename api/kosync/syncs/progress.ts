/**
 * PUT /api/kosync/syncs/progress
 * Upsert reading progress for a document (KOReader Progress Sync protocol).
 */

import { apiHandler } from "../../_utils/api-handler.js";
import * as RateLimit from "../../_utils/_rate-limit.js";
import { authorizeKosyncRequest } from "../_helpers/_auth.js";
import { bridgeKosyncProgressToBooks } from "../_helpers/_books-bridge.js";
import { KosyncErrorCode, sendKosyncError } from "../_helpers/_errors.js";
import {
  isValidKosyncField,
  isValidKosyncKeyField,
} from "../_helpers/_md5.js";
import {
  getKosyncProgress,
  setKosyncProgress,
} from "../_helpers/_progress.js";
import { KOSYNC_CORS_HEADERS } from "../_helpers/_types.js";
import type { KosyncProgressRecord } from "../_helpers/_types.js";

interface ProgressBody {
  document?: string;
  progress?: string;
  percentage?: number | string;
  device?: string;
  device_id?: string;
}

export default apiHandler(
  {
    methods: ["PUT"],
    auth: "none",
    parseJsonBody: true,
    allowMissingOrigin: true,
    corsHeaders: KOSYNC_CORS_HEADERS,
  },
  async ({ req, res, redis, logger, startTime, body }) => {
    let username: string | null = null;
    try {
      username = await authorizeKosyncRequest(req, redis);
      if (!username) {
        sendKosyncError(res, KosyncErrorCode.UNAUTHORIZED);
        return;
      }
    } catch (error) {
      logger.error("kosync progress auth failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
      return;
    }

    try {
      const rl = await RateLimit.checkCounterLimit({
        key: RateLimit.makeKey([
          "rl",
          "kosync",
          "progress",
          "user",
          username,
        ]),
        windowSeconds: 60,
        limit: 120,
      });
      if (!rl.allowed) {
        res.setHeader("Retry-After", String(rl.resetSeconds));
        logger.response(429, Date.now() - startTime);
        res.status(429).json({
          code: KosyncErrorCode.INTERNAL,
          message: "Too many progress updates.",
        });
        return;
      }
    } catch (error) {
      logger.error("kosync progress rate limit failed", error);
    }

    const payload = (body || {}) as ProgressBody;
    if (!isValidKosyncKeyField(payload.document)) {
      sendKosyncError(res, KosyncErrorCode.DOCUMENT_MISSING);
      return;
    }

    const percentage = Number(payload.percentage);
    const progress = payload.progress;
    const device = payload.device;
    const deviceId =
      typeof payload.device_id === "string" && payload.device_id.length > 0
        ? payload.device_id
        : "unknown";

    if (
      !Number.isFinite(percentage) ||
      !isValidKosyncField(progress) ||
      !isValidKosyncField(device)
    ) {
      sendKosyncError(res, KosyncErrorCode.INVALID_FIELDS);
      return;
    }

    const documentId = payload.document.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    const record: KosyncProgressRecord = {
      percentage: Math.min(1, Math.max(0, percentage)),
      progress,
      device,
      device_id: deviceId,
      timestamp,
    };

    try {
      const previous = await getKosyncProgress(redis, username, documentId);
      const bridgeResult = await bridgeKosyncProgressToBooks(
        redis,
        username,
        documentId,
        record,
        previous?.timestamp ?? null
      );
      if (bridgeResult.accepted) {
        await setKosyncProgress(redis, username, documentId, record);
      }
      logger.info("kosync progress updated", {
        username,
        documentId,
        bridgedPath: bridgeResult.path,
        accepted: bridgeResult.accepted,
        reason: bridgeResult.reason,
        percentage: bridgeResult.accepted ? record.percentage : undefined,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        document: documentId,
        timestamp: bridgeResult.timestamp,
      });
    } catch (error) {
      logger.error("kosync progress update failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
    }
  }
);
