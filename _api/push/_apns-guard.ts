import type { VercelResponse } from "@vercel/node";
import {
  getApnsConfigFromEnv,
  getMissingApnsEnvVars,
  type ApnsConfig,
} from "../_utils/_push-apns.js";
import { respondMissingEnvConfig } from "./_errors.js";

interface PushApnsGuardLoggerLike {
  warn?: (message: string, data?: unknown) => void;
  error: (message: string, error?: unknown) => void;
  response: (statusCode: number, duration?: number) => void;
}

export function getApnsConfigOrRespond(
  res: VercelResponse,
  logger: PushApnsGuardLoggerLike,
  startTime: number
): ApnsConfig | null {
  const apnsConfig = getApnsConfigFromEnv();
  if (apnsConfig) {
    return apnsConfig;
  }

  respondMissingEnvConfig(res, logger, startTime, "APNs", getMissingApnsEnvVars());
  return null;
}
