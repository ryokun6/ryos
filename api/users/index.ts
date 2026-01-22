/**
 * GET /api/users
 * 
 * Search for users
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  setCorsHeaders,
} from "../_utils/middleware.js";
import { handleGetUsers } from "../rooms/_helpers/_users.js";


export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getOriginFromVercel(req);
  
  if (handlePreflight(req, res, ["GET", "OPTIONS"])) {
    return;
  }

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  setCorsHeaders(res, origin, ["GET", "OPTIONS"]);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const searchQuery = (req.query.search as string) || "";

  try {
    const response = await handleGetUsers("users-search", searchQuery);
    const data = await response.json();
    
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
}
