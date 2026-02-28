/**
 * GET /api/users
 * Search for users
 * Node.js runtime with terminal logging
 */

import { handleGetUsers } from "../rooms/_helpers/_users.js";
import { createApiHandler } from "../_utils/middleware.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    methods: ["GET"],
    action: "users/search",
    cors: { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] },
  },
  async (ctx): Promise<void> => {
    const searchQuery = (ctx.req.query.search as string) || "";

    try {
      const response = await handleGetUsers("users-search", searchQuery);
      const data = (await response.json()) as {
        users?: unknown[];
        [key: string]: unknown;
      };

      ctx.logger.info("Users searched", {
        query: searchQuery,
        count: data.users?.length || 0,
      });
      ctx.response.json(data, response.status);
    } catch (error) {
      ctx.logger.error("Error searching users", error);
      ctx.response.error("Failed to search users", 500);
    }
  }
);
