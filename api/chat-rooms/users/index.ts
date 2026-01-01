import { handleRequest } from "../_http.js";
import { handleGetUsers } from "../_users.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "users:search",
    handler: async ({ requestId, url }) => {
      const searchQuery = url.searchParams.get("search") || "";
      return handleGetUsers(requestId, searchQuery);
    },
  });
}
