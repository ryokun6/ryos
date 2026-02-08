import { Redis } from "@upstash/redis";

const REQUIRED_REDIS_ENV_VARS = [
  "REDIS_KV_REST_API_URL",
  "REDIS_KV_REST_API_TOKEN",
] as const;

export function getMissingPushRedisEnvVars(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  return REQUIRED_REDIS_ENV_VARS.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
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
