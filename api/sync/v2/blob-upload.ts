import { apiHandler } from "../../_utils/api-handler.js";
import {
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "../../_utils/request-body.js";
import {
  getStorageBackend,
  uploadStoredObject,
} from "../../_utils/storage.js";
import {
  isUploadPathOwnedByUser,
  verifyStorageUploadToken,
} from "../../_utils/storage-upload-token.js";
import { makeKey } from "../../_utils/_rate-limit-key.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export const config = {
  api: {
    bodyParser: false,
  },
};

/** Keep in sync with `MAX_UPLOAD_ITEMS` in `api/sync/v2/blobs.ts`. */
const MAX_UPLOAD_ITEMS = 200;
const MAX_BLOB_SIZE = 50 * 1024 * 1024;
const RATE_LIMIT_WINDOW = 60;
/** Allow a full sync blob batch plus a small retry margin. */
const RATE_LIMIT_MAX = MAX_UPLOAD_ITEMS + 50;

export default apiHandler(
  {
    methods: ["PUT"],
    auth: "required",
    contentType: null,
  },
  async ({ req, res, redis, user }): Promise<void> => {
    if (getStorageBackend() !== "s3") {
      res.status(400).json({ error: "Blob proxy upload requires S3 storage." });
      return;
    }

    const username = user?.username || "";
    const tokenParam = req.query.token;
    const token = typeof tokenParam === "string" ? tokenParam : "";
    const claims = verifyStorageUploadToken(token);

    if (!claims || !isUploadPathOwnedByUser(claims.pathname, username)) {
      res.status(403).json({ error: "Invalid or expired upload token." });
      return;
    }

    const maxBytes = Math.min(claims.maximumSizeInBytes, MAX_BLOB_SIZE);
    const contentTypeHeader = req.headers["content-type"];
    const requestContentType =
      typeof contentTypeHeader === "string"
        ? contentTypeHeader.split(";")[0]?.trim().toLowerCase()
        : "";
    const allowedContentType = claims.contentType.split(";")[0]?.trim().toLowerCase();

    if (
      requestContentType &&
      allowedContentType &&
      requestContentType !== allowedContentType
    ) {
      res.status(400).json({ error: "Upload Content-Type does not match token." });
      return;
    }

    const contentLengthHeader = req.headers["content-length"];
    const contentLength =
      typeof contentLengthHeader === "string"
        ? Number.parseInt(contentLengthHeader, 10)
        : Number.NaN;

    if (
      Number.isFinite(contentLength) &&
      (contentLength <= 0 || contentLength > maxBytes)
    ) {
      res.status(400).json({ error: "Invalid upload size." });
      return;
    }

    const rateLimitKey = makeKey(["rl", "sync2", "blob-upload", "user", username]);
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }
    if (current > RATE_LIMIT_MAX) {
      res.status(429).json({ error: "Too many blob uploads. Please try again shortly." });
      return;
    }

    try {
      const body = await readRequestBodyBuffer(req, maxBytes);
      if (body.length <= 0) {
        res.status(400).json({ error: "Invalid upload size." });
        return;
      }

      await uploadStoredObject({
        pathname: claims.pathname,
        contentType: claims.contentType,
        body,
      });

      res.status(204).end();
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        res.status(413).json({ error: "Upload exceeds allowed size." });
        return;
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[sync2] blob proxy upload failed:", message, error);
      res.status(500).json({ error: `Blob upload failed: ${message}` });
    }
  }
);
