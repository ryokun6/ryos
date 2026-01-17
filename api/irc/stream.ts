import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSession, registerSessionListener } from "./_sessions.js";
import type { IrcStreamEvent } from "../../src/types/irc.js";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const sendEvent = (event: IrcStreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  sendEvent({
    type: "system",
    payload: { text: "connected" },
  });

  const unsubscribe = registerSessionListener(sessionId, sendEvent);
  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
}
