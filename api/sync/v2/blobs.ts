import { apiHandler } from "../../_utils/api-handler.js";
import {
  createSignedDownloadUrl,
  createStorageUploadDescriptor,
  getStorageBackend,
} from "../../_utils/storage.js";
import type { BlobUploadResultItem } from "../../../src/shared/sync2/types.js";
import { lookupSyncBlobs } from "./_core.js";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BLOB_SIZE = 50 * 1024 * 1024;
const MAX_UPLOAD_ITEMS = 200;
const MAX_DOWNLOAD_ITEMS = 500;
const RATE_LIMIT_WINDOW = 60;
const RATE_LIMIT_MAX = 120;

interface PostBlobsBody {
  upload?: Array<{ sha256?: string; size?: number }>;
  download?: string[];
}

function isValidSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function blobPath(username: string, sha256: string): string {
  return `sync/${username}/blobs/${sha256}.gz`;
}

/**
 * Only sign download URLs that point at the user's own sync objects
 * (v2 content-addressed blobs or legacy v1 per-item paths).
 */
function isOwnSyncObjectUrl(url: string, username: string): boolean {
  const prefix = `sync/${username}/`;
  if (url.startsWith("s3://")) {
    const withoutScheme = url.slice("s3://".length);
    const slash = withoutScheme.indexOf("/");
    if (slash === -1) return false;
    return withoutScheme.slice(slash + 1).startsWith(prefix);
  }
  if (url.startsWith("https://")) {
    try {
      return new URL(url).pathname.includes(`/${prefix}`);
    } catch {
      return false;
    }
  }
  return false;
}

export default apiHandler<PostBlobsBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";
    const uploadRequests = Array.isArray(body?.upload) ? body!.upload! : [];
    const downloadRequests = Array.isArray(body?.download) ? body!.download! : [];

    if (uploadRequests.length === 0 && downloadRequests.length === 0) {
      res.status(400).json({ error: "Provide upload and/or download entries" });
      return;
    }
    if (uploadRequests.length > MAX_UPLOAD_ITEMS) {
      res.status(400).json({ error: `Too many upload entries (max ${MAX_UPLOAD_ITEMS})` });
      return;
    }
    if (downloadRequests.length > MAX_DOWNLOAD_ITEMS) {
      res.status(400).json({ error: `Too many download entries (max ${MAX_DOWNLOAD_ITEMS})` });
      return;
    }

    const rateLimitKey = `rl:sync2:blobs:${username}`;
    const current = await redis.incr(rateLimitKey);
    if (current === 1) {
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    }
    if (current > RATE_LIMIT_MAX) {
      res.status(429).json({ error: "Too many blob requests. Please try again shortly." });
      return;
    }

    try {
      const uploads: BlobUploadResultItem[] = [];
      if (uploadRequests.length > 0) {
        for (const item of uploadRequests) {
          if (!isValidSha256(item?.sha256)) {
            res.status(400).json({ error: "Invalid blob sha256" });
            return;
          }
          if (
            typeof item.size !== "number" ||
            !Number.isFinite(item.size) ||
            item.size <= 0 ||
            item.size > MAX_BLOB_SIZE
          ) {
            res.status(400).json({ error: `Invalid blob size for ${item.sha256}` });
            return;
          }
        }

        const digests = uploadRequests.map((item) => item.sha256!);
        const known = await lookupSyncBlobs(redis, username, digests);

        for (let index = 0; index < uploadRequests.length; index += 1) {
          const sha256 = digests[index];
          const existing = known[index];
          if (existing) {
            uploads.push({ sha256, exists: true, url: existing.url });
            continue;
          }

          const descriptor = await createStorageUploadDescriptor({
            pathname: blobPath(username, sha256),
            contentType: "application/gzip",
            allowedContentTypes: ["application/gzip", "application/octet-stream"],
            maximumSizeInBytes: MAX_BLOB_SIZE,
            allowOverwrite: true,
          });
          uploads.push({
            sha256,
            exists: false,
            upload: descriptor,
            ...(getStorageBackend() === "s3" && "storageUrl" in descriptor
              ? { storageUrl: descriptor.storageUrl }
              : {}),
          });
        }
      }

      let downloads: (string | null)[] | undefined;
      if (downloadRequests.length > 0) {
        downloads = await Promise.all(
          downloadRequests.map(async (url) => {
            if (typeof url !== "string" || !isOwnSyncObjectUrl(url, username)) {
              return null;
            }
            try {
              return await createSignedDownloadUrl(url);
            } catch {
              return null;
            }
          })
        );
      }

      res.status(200).json({
        ok: true,
        ...(uploads.length > 0 ? { uploads } : {}),
        ...(downloads ? { downloads } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[sync2] blobs request failed:", message, error);
      res.status(500).json({ error: `Blob request failed: ${message}` });
    }
  }
);
