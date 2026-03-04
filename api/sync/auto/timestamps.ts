/**
 * GET /api/sync/auto/timestamps
 *
 * Returns the last-modified timestamps for each auto-sync category.
 * Used by clients to check if there are newer updates without downloading data.
 * Requires authentication (Bearer token + X-Username).
 */

import { apiHandler } from "../../_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 10;

function timestampsKey(username: string) {
  return `sync:auto:${username}:timestamps`;
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
  },
  async ({ res, redis, user }): Promise<void> => {
    const username = user?.username || "";

    const timestamps =
      (await redis.hgetall(timestampsKey(username))) || {};

    res.status(200).json({ ok: true, timestamps });
  }
);
