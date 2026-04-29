/**
 * GET /api/ai/cursor-run-status?runId=
 * Poll Cursor SDK run events stored in Redis (async agent mode).
 */

import {
  CURSOR_REPO_AGENT_OWNER,
  cursorSdkEventsKey,
  cursorSdkMetaKey,
} from "../chat/tools/cursor-repo-agent.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";

/** Upstash may return objects for JSON-looking strings; parse string-or-object safely */
function parseStoredJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function firstQueryValue(q: unknown): string {
  if (typeof q === "string") return q;
  if (Array.isArray(q) && typeof q[0] === "string") return q[0];
  return "";
}

/**
 * Cursor SDK stream payloads may include BigInt / shapes that break JSON.stringify on res.json().
 */
function safeWireClone(value: unknown): unknown {
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) =>
        typeof v === "bigint" ? v.toString() : v
      )
    );
  } catch {
    return {
      _serializationFailed: true,
      preview: typeof value === "string" ? value : String(value).slice(0, 4000),
    };
  }
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
    parseJsonBody: false,
    contentType: "application/json",
  },
  async ({ req, res, user, redis, logger, startTime }) => {
    const username = user?.username ?? "";
    if (username !== CURSOR_REPO_AGENT_OWNER) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const runId =
      firstQueryValue(req.query?.runId).trim() ||
      new URL(req.url || "/", "http://localhost").searchParams.get("runId")?.trim() ||
      "";

    if (!runId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "runId required" });
      return;
    }

    const metaKey = cursorSdkMetaKey(runId);
    const rawMeta = await redis.get(metaKey);
    const meta = parseStoredJson<{ username?: string }>(rawMeta);
    if (!meta) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Run not found" });
      return;
    }

    if (meta.username !== username) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const eventsKey = cursorSdkEventsKey(runId);
    const rawLinesUnknown = await redis.lrange(eventsKey, 0, -1);
    const rawLines = Array.isArray(rawLinesUnknown)
      ? rawLinesUnknown
      : [];

    const chronological = [...rawLines].reverse().map((line) => {
      if (typeof line === "object" && line !== null) {
        return safeWireClone(line);
      }
      if (typeof line === "string") {
        try {
          const parsed = JSON.parse(line) as unknown;
          return safeWireClone(parsed);
        } catch {
          return { parseError: true, raw: line };
        }
      }
      return safeWireClone(line);
    });

    const terminal = chronological.find(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        (e as { type?: string }).type === "terminal"
    );

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      runId,
      meta: safeWireClone(meta),
      events: chronological,
      done: !!terminal,
      terminal: terminal ? safeWireClone(terminal) : null,
    });
  }
);
