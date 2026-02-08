import type { VercelResponse } from "@vercel/node";
import {
  getApnsConfigFromEnv,
  getMissingApnsEnvVars,
  type ApnsConfig,
} from "../_utils/_push-apns.js";
import {
  respondMissingEnvConfig,
  type PushLoggerLike,
} from "./_errors.js";

export function getApnsConfigOrRespond(
  res: VercelResponse,
  logger: PushLoggerLike,
  startTime: number
): ApnsConfig | null {
  const apnsConfig = getApnsConfigFromEnv();
  if (apnsConfig) {
    return apnsConfig;
  }

  respondMissingEnvConfig(res, logger, startTime, "APNs", getMissingApnsEnvVars());
  return null;
}
