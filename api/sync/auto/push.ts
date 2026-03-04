/**
 * POST /api/sync/auto/push - Push auto-sync data for one or more categories
 *
 * Body: { categories: Record<string, string> }
 * Each value is a JSON string (or gzip-compressed base64 for files) of the
 * category data. Stores per-category data and timestamps in Redis.
 * Requires authentication (Bearer token + X-Username).
 */

import { USER_TTL_SECONDS } from "../../_utils/auth/index.js";
import { apiHandler } from "../../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 30;

const META_TTL = USER_TTL_SECONDS;
const MAX_CATEGORY_SIZE = 1024 * 1024; // 1MB for lightweight categories
const MAX_FILES_SIZE = 50 * 1024 * 1024; // 50MB for files (compressed)

const VALID_CATEGORIES = [
  "settings",
  "files",
  "musicLibrary",
  "calendar",
  "stickies",
];

function dataKey(username: string, category: string) {
  return `sync:auto:${username}:${category}`;
}

function timestampsKey(username: string) {
  return `sync:auto:${username}:timestamps`;
}

interface PushBody {
  categories: Record<string, string>;
}

export default apiHandler<PushBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
  },
  async ({ res, redis, user, body }): Promise<void> => {
    const username = user?.username || "";

    if (!body?.categories || typeof body.categories !== "object") {
      res.status(400).json({ error: "Missing categories object in body" });
      return;
    }

    const results: Record<string, { ok: boolean; error?: string }> = {};
    const now = new Date().toISOString();

    for (const [category, data] of Object.entries(body.categories)) {
      if (!VALID_CATEGORIES.includes(category)) {
        results[category] = { ok: false, error: "Invalid category" };
        continue;
      }

      if (typeof data !== "string") {
        results[category] = { ok: false, error: "Data must be a string" };
        continue;
      }

      const maxSize =
        category === "files" ? MAX_FILES_SIZE : MAX_CATEGORY_SIZE;
      if (data.length > maxSize) {
        results[category] = {
          ok: false,
          error: `Data too large (${(data.length / 1024).toFixed(0)}KB). Max ${(maxSize / (1024 * 1024)).toFixed(0)}MB.`,
        };
        continue;
      }

      try {
        await redis.set(dataKey(username, category), data, { ex: META_TTL });
        await redis.hset(timestampsKey(username), { [category]: now });
        await redis.expire(timestampsKey(username), META_TTL);
        results[category] = { ok: true };
      } catch (error) {
        console.error(`[AutoSync] Error pushing ${category}:`, error);
        results[category] = { ok: false, error: "Storage error" };
      }
    }

    res.status(200).json({ ok: true, results, timestamp: now });
  }
);
