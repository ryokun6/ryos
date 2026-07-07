/**
 * GET /api/users
 * Search for users
 */

import { apiHandler } from "../_utils/api-handler.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import { getClientIp } from "../_utils/_rate-limit.js";
import { handleGetUsers } from "../rooms/_helpers/_users.js";

const RL_BURST_WINDOW = 60;
const RL_DAILY_WINDOW = 60 * 60 * 24;
const MIN_QUERY_LENGTH = 2;

export default apiHandler(
  { methods: ["GET"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const searchQuery = ((req.query.search as string) || "").trim();

    // Require a minimum query length: prevents enumerating the whole user
    // base via empty / single-character SCAN-backed searches.
    if (searchQuery.length < MIN_QUERY_LENGTH) {
      logger.response(400, Date.now() - startTime);
      res
        .status(400)
        .json({ error: `Search query must be at least ${MIN_QUERY_LENGTH} characters` });
      return;
    }

    // Rate limit per authenticated user: burst 20/min + daily 1000.
    try {
      const identifier = user?.username || getClientIp(req);
      const rl = await RateLimit.checkBurstAndDailyLimits({
        namespace: "users-search",
        identifierParts: ["user", identifier],
        burst: { windowSeconds: RL_BURST_WINDOW, limit: 20 },
        daily: { windowSeconds: RL_DAILY_WINDOW, limit: 1000 },
      });
      if (!rl.ok) {
        const fallbackWindow =
          rl.scope === "burst" ? RL_BURST_WINDOW : RL_DAILY_WINDOW;
        logger.warn(`Rate limit exceeded (${rl.scope})`, { user: user?.username });
        logger.response(429, Date.now() - startTime);
        res.setHeader("Retry-After", String(rl.result?.resetSeconds ?? fallbackWindow));
        res.status(429).json({ error: "rate_limit_exceeded", scope: rl.scope });
        return;
      }
    } catch (e) {
      logger.error("Rate limit check failed", e);
    }

    try {
      const response = await handleGetUsers("users-search", searchQuery);
      const data = await response.json() as { users?: unknown[] };

      logger.info("Users searched", { query: searchQuery, count: data.users?.length || 0 });
      logger.response(response.status, Date.now() - startTime);
      res.status(response.status).json(data);
    } catch (error) {
      logger.error("Error searching users", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to search users" });
    }
  }
);
