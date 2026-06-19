/**
 * Same-origin proxy for Cloud Sync v2 blob (and backup) objects.
 *
 * PUT /api/sync/blob-proxy?key=<storage key>  — stream blob bytes to storage
 * GET /api/sync/blob-proxy?key=<storage key>  — stream blob bytes back
 *
 * Used only when `S3_PROXY_BLOBS` is enabled (S3 backend). It lets the browser
 * upload/download blobs through our own origin instead of directly to the
 * object-storage bucket, so cloud sync works even when the bucket's CORS
 * allowlist does not include the origin the app is served from.
 *
 * Requires authentication. Callers may only touch their own keys
 * (`sync/<username>/…` or `backups/<username>/…`).
 */

import type { VercelRequest } from "@vercel/node";
import { apiHandler } from "../_utils/api-handler.js";
import {
  downloadStoredObject,
  getS3StorageUrlForKey,
  getStorageBackend,
  putStoredObject,
  shouldProxyS3Blobs,
} from "../_utils/storage.js";
import { makeKey } from "../_utils/_rate-limit-key.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BLOB_SIZE = 50 * 1024 * 1024;
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 240;

function normalizeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.replace(/^\/+/, "");
  if (!key || key.includes("..")) return null;
  return key;
}

function isOwnedKey(key: string, username: string): boolean {
  if (!username) return false;
  return (
    key.startsWith(`sync/${username}/`) || key.startsWith(`backups/${username}/`)
  );
}

function isProxyEnabled(): boolean {
  try {
    return getStorageBackend() === "s3" && shouldProxyS3Blobs();
  } catch {
    return false;
  }
}

async function readLimitedBody(
  req: VercelRequest,
  maxBytes: number
): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Uint8Array | Buffer | string>) {
    const buffer =
      typeof chunk === "string"
        ? new TextEncoder().encode(chunk)
        : chunk instanceof Uint8Array
          ? chunk
          : new Uint8Array(chunk);
    total += buffer.length;
    if (total > maxBytes) {
      return null;
    }
    chunks.push(buffer);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

export default apiHandler(
  {
    methods: ["GET", "PUT"],
    auth: "required",
    parseJsonBody: false,
    contentType: null,
  },
  async ({ req, res, redis, user }): Promise<void> => {
    const username = user?.username || "";

    if (!isProxyEnabled()) {
      res.status(404).json({ error: "Blob proxy is not enabled" });
      return;
    }

    const key = normalizeKey(req.query.key);
    if (!key || !isOwnedKey(key, username)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rateLimitKey = makeKey([
      "rl",
      "sync2",
      "blob-proxy",
      "user",
      username,
    ]);
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }
    if (current > RATE_LIMIT_MAX) {
      res
        .status(429)
        .json({ error: "Too many blob requests. Please try again shortly." });
      return;
    }

    const storageUrl = getS3StorageUrlForKey(key);
    const method = (req.method || "GET").toUpperCase();

    if (method === "PUT") {
      try {
        const body = await readLimitedBody(req, MAX_BLOB_SIZE);
        if (body === null) {
          res
            .status(413)
            .json({ error: `Blob exceeds ${MAX_BLOB_SIZE} byte limit` });
          return;
        }
        if (body.length === 0) {
          res.status(400).json({ error: "Empty blob body" });
          return;
        }

        await putStoredObject(storageUrl, body, "application/gzip");
        res.status(200).json({ ok: true, storageUrl });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[sync2] blob proxy upload failed:", message, error);
        res.status(502).json({ error: `Blob upload failed: ${message}` });
      }
      return;
    }

    // GET — download
    try {
      const bytes = await downloadStoredObject(storageUrl);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.status(200).send(Buffer.from(bytes));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[sync2] blob proxy download failed:", message, error);
      res.status(404).json({ error: "Blob not found" });
    }
  }
);
