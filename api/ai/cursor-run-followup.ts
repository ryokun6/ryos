/**
 * POST /api/ai/cursor-run-followup
 * Send a follow-up prompt to the Cursor Cloud agent that owns an existing run.
 *
 * Body: { runId: string, prompt: string }
 *
 * Resumes the agent via `Agent.resume`, sends a new prompt, and starts a fresh
 * background streaming consumer for the new run. The new runId is returned so
 * the chat UI can swap its poll target to the follow-up's event stream.
 */

import { sendCursorAgentFollowup } from "../chat/tools/cursor-repo-agent.js";
import { apiHandler } from "../_utils/api-handler.js";

export const runtime = "nodejs";

interface CursorRunFollowupBody {
  runId?: unknown;
  prompt?: unknown;
}

export default apiHandler<CursorRunFollowupBody>(
  {
    methods: ["POST"],
    auth: "required",
    parseJsonBody: true,
    contentType: "application/json",
  },
  async ({ res, body, user, redis, logger, startTime }) => {
    const username = user?.username ?? "";

    if (!body || typeof body !== "object") {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const runId =
      typeof body.runId === "string" ? body.runId.trim() : "";
    const prompt =
      typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!runId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "runId required" });
      return;
    }
    if (!prompt) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "prompt required" });
      return;
    }

    const apiKey = process.env.CURSOR_API_KEY?.trim();
    if (!apiKey) {
      logger.response(503, Date.now() - startTime);
      res.status(503).json({ error: "Cursor SDK not configured" });
      return;
    }

    const result = await sendCursorAgentFollowup({
      previousRunId: runId,
      prompt,
      context: {
        apiKey,
        username,
        redis,
        log: (message: unknown, data?: unknown) =>
          logger.info(typeof message === "string" ? message : String(message), data),
        logError: (message: unknown, error?: unknown) =>
          logger.error(
            typeof message === "string" ? message : String(message),
            error
          ),
      },
    });

    if (!result.ok) {
      logger.response(result.status, Date.now() - startTime);
      res.status(result.status).json({ error: result.error });
      return;
    }

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      runId: result.runId,
      agentId: result.agentId,
      previousRunId: result.previousRunId,
      message: result.message,
    });
  }
);
