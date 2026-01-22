/**
 * GET /api/users
 * 
 * Search for users
 */

import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  errorResponse,
  jsonResponse,
} from "../_utils/middleware.js";
import { handleGetUsers } from "../rooms/_helpers/_users.js";


export const config = {
  runtime: "nodejs",
};

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const url = new URL(req.url);
  const searchQuery = url.searchParams.get("search") || "";

  try {
    const response = await handleGetUsers("users-search", searchQuery);
    const data = await response.json();
    
    return new Response(JSON.stringify(data), { status: response.status, headers });
  } catch (error) {
    console.error("Error searching users:", error);
    return new Response(JSON.stringify({ error: "Failed to search users" }), { status: 500, headers });
  }
}
