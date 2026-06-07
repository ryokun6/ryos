import type { Redis } from "./redis.js";
import { createRedis } from "./redis.js";

export function createRedisClient(): Redis {
  return createRedis();
}

export function generateRandomHexId(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getCurrentTimestamp(): number {
  return Date.now();
}

export function parseJSON<T>(data: unknown): T | null {
  if (!data) return null;
  if (typeof data === "object") return data as T;
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }
  return null;
}
