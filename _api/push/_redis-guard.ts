import type { VercelResponse } from "@vercel/node";
import {
  respondMissingEnvConfig,
  type PushLoggerLike,
} from "./_errors.js";
import { createPushRedis, getMissingPushRedisEnvVars } from "./_redis.js";

export function createPushRedisOrRespond(
  res: VercelResponse,
  logger: PushLoggerLike,
  startTime: number
): ReturnType<typeof createPushRedis> | null {
  const missingRedisEnvVars = getMissingPushRedisEnvVars();
  if (missingRedisEnvVars.length > 0) {
    respondMissingEnvConfig(res, logger, startTime, "Redis", missingRedisEnvVars);
    return null;
  }

  return createPushRedis();
}
