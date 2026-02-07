import type { VercelResponse } from "@vercel/node";

interface PushLoggerLike {
  error: (message: string, error?: unknown) => void;
  response: (statusCode: number, duration?: number) => void;
}

export function respondInternalServerError(
  res: VercelResponse,
  logger: PushLoggerLike,
  startTime: number,
  contextMessage: string,
  error: unknown
) {
  logger.error(contextMessage, error);
  logger.response(500, Date.now() - startTime);
  return res.status(500).json({ error: "Internal server error" });
}
