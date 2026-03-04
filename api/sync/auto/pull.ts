/**
 * GET /api/sync/auto/pull?categories=settings,calendar,...
 *
 * Returns stored auto-sync data for the requested categories.
 * Requires authentication (Bearer token + X-Username).
 */

import { apiHandler } from "../../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 15;

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

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ req, res, redis, user }): Promise<void> => {
    const username = user?.username || "";

    const categoriesParam =
      typeof req.query.categories === "string" ? req.query.categories : "";
    const requested = categoriesParam
      .split(",")
      .map((c) => c.trim())
      .filter((c) => VALID_CATEGORIES.includes(c));

    if (requested.length === 0) {
      res.status(400).json({ error: "No valid categories requested" });
      return;
    }

    const timestamps =
      (await redis.hgetall(timestampsKey(username))) || {};

    const categories: Record<
      string,
      { data: string; timestamp: string } | null
    > = {};

    for (const category of requested) {
      const ts = (timestamps as Record<string, string>)[category];
      if (!ts) {
        categories[category] = null;
        continue;
      }

      const data = await redis.get<string>(dataKey(username, category));
      if (data) {
        categories[category] = {
          data: typeof data === "string" ? data : JSON.stringify(data),
          timestamp: ts,
        };
      } else {
        categories[category] = null;
      }
    }

    res.status(200).json({ ok: true, categories });
  }
);
