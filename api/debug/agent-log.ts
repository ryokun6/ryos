import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  setCorsHeaders,
} from "../_utils/_cors.js";

export const runtime = "nodejs";
export const maxDuration = 5;

const LOG_PATH = "/opt/cursor/logs/debug.log";

async function readJsonBody(req: VercelRequest): Promise<unknown> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  let raw = "";
  for await (const chunk of req) {
    raw += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  return raw ? JSON.parse(raw) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const body = await readJsonBody(req).catch(() => null);
  if (!isRecord(body)) {
    res.status(400).json({ error: "Invalid debug payload" });
    return;
  }

  const entry = {
    hypothesisId: typeof body.hypothesisId === "string" ? body.hypothesisId : "unknown",
    location: typeof body.location === "string" ? body.location : "unknown",
    message: typeof body.message === "string" ? body.message : "unknown",
    data: isRecord(body.data) ? body.data : {},
    timestamp: typeof body.timestamp === "number" ? body.timestamp : Date.now(),
  };

  mkdirSync(dirname(LOG_PATH), { recursive: true });
  // #region agent log
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  // #endregion
  res.status(204).end();
}
