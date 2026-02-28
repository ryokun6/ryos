/**
 * POST /api/ai/extract-memories
 *
 * Wrapper around runtime-agnostic extract memories core.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { executeAiExtractMemoriesCore } from "../cores/ai-extract-memories-core.js";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { logger } = initLogger();
  const startTime = Date.now();

  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });

  logger.request(req.method || "POST", req.url || "/api/ai/extract-memories");

  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  const result = await executeAiExtractMemoriesCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    authHeader: req.headers.authorization as string | undefined,
    usernameHeader: req.headers["x-username"] as string | undefined,
    body: req.body,
  });

  if (result.status === 403) {
    logger.warn("Unauthorized origin", { origin });
  } else if (result.status === 401) {
    const error = (result.body as { error?: string })?.error;
    if (error?.includes("missing credentials")) {
      logger.warn("Missing credentials");
    } else {
      logger.warn("Invalid token", { username: req.headers["x-username"] });
    }
  } else if (result.status === 400) {
    logger.warn("No messages provided");
  } else if (result.status === 200) {
    const body = result.body as {
      extracted?: number;
      dailyNotes?: number;
      analyzed?: number;
      message?: string;
    };
    if (body.message === "Conversation too short") {
      logger.info("Conversation too short for extraction");
    } else {
      logger.info("Done", {
        dailyNotes: body.dailyNotes,
        longTerm: body.extracted,
      });
    }
  } else if (result.status >= 500) {
    logger.error("Memory extraction failed");
  }

  logger.response(result.status, Date.now() - startTime);
  return res.status(result.status).json(result.body);
}
