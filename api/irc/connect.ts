import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createSession } from "./_sessions.js";

export const runtime = "nodejs";
export const maxDuration = 15;

const sanitizeNick = (nick: string) =>
  nick
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-\[\]\\`^{}|]/g, "")
    .slice(0, 24) || "ryos_guest";

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
  const nickInput = typeof body.nick === "string" ? body.nick : "";
  const channelsInput = Array.isArray(body.channels)
    ? body.channels.filter((channel: unknown) => typeof channel === "string")
    : undefined;

  const nick = sanitizeNick(nickInput);
  const response = createSession(nick, channelsInput);

  return res.status(200).json(response);
}
