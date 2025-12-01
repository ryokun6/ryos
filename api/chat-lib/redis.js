import { Redis } from "@upstash/redis";

let redisClient = null;

export const getRedisClient = () => {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.REDIS_KV_REST_API_URL;
  const token = process.env.REDIS_KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing REDIS_KV_REST_API_URL or REDIS_KV_REST_API_TOKEN environment variables"
    );
  }

  redisClient = new Redis({ url, token });
  return redisClient;
};
