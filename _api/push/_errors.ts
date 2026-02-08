import type { VercelResponse } from "@vercel/node";

export interface PushLoggerLike {
  warn?: (message: string, data?: unknown) => void;
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

export function respondMissingEnvConfig(
  res: VercelResponse,
  logger: PushLoggerLike,
  startTime: number,
  serviceName: string,
  missingEnvVars: string[]
) {
  logger.warn?.(`${serviceName} is not configured`, { missingEnvVars });
  logger.response(500, Date.now() - startTime);
  return res.status(500).json({
    error: `${serviceName} is not configured.`,
    missingEnvVars,
  });
}
