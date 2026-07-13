/**
 * GET /api/kosync/syncs/progress/:document
 * Fetch reading progress for a document, merging kosync + Books bookshelf.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { authorizeKosyncRequest } from "../_helpers/_auth.js";
import {
  bridgeBooksProgressToKosync,
  pickNewerProgress,
} from "../_helpers/_books-bridge.js";
import { KosyncErrorCode, sendKosyncError } from "../_helpers/_errors.js";
import { isValidKosyncKeyField } from "../_helpers/_md5.js";
import { getKosyncProgress } from "../_helpers/_progress.js";
import { KOSYNC_CORS_HEADERS } from "../_helpers/_types.js";

export default apiHandler(
  {
    methods: ["GET"],
    auth: "none",
    allowMissingOrigin: true,
    corsHeaders: KOSYNC_CORS_HEADERS,
  },
  async ({ req, res, redis, logger, startTime }) => {
    let username: string | null = null;
    try {
      username = await authorizeKosyncRequest(req, redis);
      if (!username) {
        sendKosyncError(res, KosyncErrorCode.UNAUTHORIZED);
        return;
      }
    } catch (error) {
      logger.error("kosync get progress auth failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
      return;
    }

    // Standalone server merges dynamic path params into `req.query`.
    const documentParam = req.query?.document as string | undefined;
    if (!isValidKosyncKeyField(documentParam)) {
      sendKosyncError(res, KosyncErrorCode.DOCUMENT_MISSING);
      return;
    }

    const documentId = documentParam.toLowerCase();

    try {
      const [native, bridged] = await Promise.all([
        getKosyncProgress(redis, username, documentId),
        bridgeBooksProgressToKosync(redis, username, documentId),
      ]);
      const winner = pickNewerProgress(native, bridged);

      if (!winner) {
        // Official server returns 200 with an empty object when unknown.
        logger.response(200, Date.now() - startTime);
        res.status(200).json({});
        return;
      }

      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        document: documentId,
        percentage: winner.percentage,
        progress: winner.progress,
        device: winner.device,
        device_id: winner.device_id,
        timestamp: winner.timestamp,
      });
    } catch (error) {
      logger.error("kosync get progress failed", error);
      sendKosyncError(res, KosyncErrorCode.INTERNAL);
    }
  }
);
