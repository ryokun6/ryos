import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sendSessionMessage } from "./_sessions.js";

export const runtime = "nodejs";
export const maxDuration = 15;

const parseBody = (req: VercelRequest) => {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const channel = typeof body.channel === "string" ? body.channel : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!sessionId || !channel || !content) {
    return res.status(400).json({ error: "sessionId, channel, content required" });
  }

  const result = sendSessionMessage(sessionId, channel, content);
  if (!result.ok) {
    return res.status(404).json({ error: result.error || "Session not found" });
  }

  return res.status(200).json({ ok: true });
}
