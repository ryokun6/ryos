import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listSessionChannels } from "./_sessions.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sessionId = Array.isArray(req.query.sessionId)
    ? req.query.sessionId[0]
    : req.query.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required" });
  }

  const channels = listSessionChannels(sessionId);
  return res.status(200).json({ channels });
}
