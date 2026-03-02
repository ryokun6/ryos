/**
 * GET /api/users
 * Search for users
 */

import { apiHandler } from "../_utils/api-handler.js";
import { handleGetUsers } from "../rooms/_helpers/_users.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, logger, startTime }) => {
    const searchQuery = (req.query.search as string) || "";

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
