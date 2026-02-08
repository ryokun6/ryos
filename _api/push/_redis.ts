import { Redis } from "@upstash/redis";
import { getMissingRequiredEnvVars } from "../_utils/_env.js";

const REQUIRED_REDIS_ENV_VARS = [
  "REDIS_KV_REST_API_URL",
  "REDIS_KV_REST_API_TOKEN",
] as const;

export function getMissingPushRedisEnvVars(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return getMissingRequiredEnvVars(REQUIRED_REDIS_ENV_VARS, env);
}

export function createPushRedis(): Redis {
  const missing = getMissingPushRedisEnvVars();
  if (missing.length > 0) {
    throw new Error(`Missing Redis env vars: ${missing.join(", ")}`);
  }

  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}
