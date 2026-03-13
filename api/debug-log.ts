import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appendFileSync } from "node:fs";

export const runtime = "nodejs";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});

  try {
    // #region agent log
    appendFileSync("/opt/cursor/logs/debug.log", `${payload}\n`);
    // #endregion
    res.status(204).end();
  } catch (error) {
    res.status(500).json({
      error: "Failed to write debug log",
      detail: error instanceof Error ? error.message : "unknown",
    });
  }
}
