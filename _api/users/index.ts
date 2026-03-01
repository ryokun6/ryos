/**
 * GET /api/users
 *
 * Search for users
 */

import { createApiHandler } from "../_utils/handler.js";
import { handleGetUsers } from "../rooms/_helpers/_users.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default createApiHandler(
  {
    operation: "users",
    methods: ["GET"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const searchQuery = ctx.getQueryParam("search") ?? "";

    try {
      const response = await handleGetUsers("users-search", searchQuery);
      const data = await response.json();

      ctx.logger.info("Users searched", {
        query: searchQuery,
        count: data.users?.length || 0,
      });
      ctx.response.json(response.status, data);
    } catch (routeError) {
      ctx.logger.error("Error searching users", routeError);
      ctx.response.serverError("Failed to search users");
    }
  }
);
