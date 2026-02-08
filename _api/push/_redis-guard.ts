import type { VercelResponse } from "@vercel/node";
import { respondMissingEnvConfig } from "./_errors.js";
import { createPushRedis, getMissingPushRedisEnvVars } from "./_redis.js";

interface PushRedisGuardLoggerLike {
  warn?: (message: string, data?: unknown) => void;
  error: (message: string, error?: unknown) => void;
  response: (statusCode: number, duration?: number) => void;
}

export function createPushRedisOrRespond(
  res: VercelResponse,
  logger: PushRedisGuardLoggerLike,
  startTime: number
): ReturnType<typeof createPushRedis> | null {
  const missingRedisEnvVars = getMissingPushRedisEnvVars();
  if (missingRedisEnvVars.length > 0) {
    respondMissingEnvConfig(res, logger, startTime, "Redis", missingRedisEnvVars);
    return null;
  }

  return createPushRedis();
}
