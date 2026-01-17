/**
 * GET /api/users
 * 
 * Search for users
 */

import {
  jsonResponse,
  errorResponse,
  handleCors,
  getQueryParam,
} from "../_utils/middleware.js";

// Import from existing chat-rooms modules
import { handleGetUsers } from "../chat-rooms/_users.js";

export const runtime = "edge";
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const searchQuery = getQueryParam(request, "search") || "";

  try {
    // Use existing handler and extract response
    const response = await handleGetUsers("users-search", searchQuery);
    const data = await response.json();
    
    return jsonResponse(data, response.status, cors.origin);
  } catch (error) {
    console.error("Error searching users:", error);
    return errorResponse("Failed to search users", 500, cors.origin);
  }
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
