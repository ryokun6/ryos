import { redisKeys } from "../../src/shared/redisKeys.js";

export const DEVICE_HISTORY_LIMIT = 16;
export const DEVICE_HISTORY_TTL_SECONDS = 14 * 24 * 60 * 60;

export interface DeviceConversationMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface DeviceHistoryStore {
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

export function buildDeviceHistoryKey(username: string): string {
  return redisKeys.integration.deviceHistory(username.toLowerCase());
}

function parseJsonRecord<T>(raw: unknown): T | null {
  try {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function parseDeviceConversationMessage(
  raw: unknown
): DeviceConversationMessage | null {
  const parsed = parseJsonRecord<DeviceConversationMessage>(raw);
  if (!parsed) return null;
  if (parsed.role !== "user" && parsed.role !== "assistant") return null;
  if (typeof parsed.content !== "string" || parsed.content.length === 0) return null;
  if (typeof parsed.createdAt !== "number") return null;
  return parsed;
}

export async function loadDeviceConversationHistory(
  redis: DeviceHistoryStore,
  username: string,
  limit: number = DEVICE_HISTORY_LIMIT
): Promise<DeviceConversationMessage[]> {
  const values =
    (await redis.lrange<string>(buildDeviceHistoryKey(username), 0, limit - 1)) || [];
  const parsed = values.reduce<DeviceConversationMessage[]>((acc, value) => {
    const message = parseDeviceConversationMessage(value);
    if (message) acc.push(message);
    return acc;
  }, []);
  return parsed.reverse();
}

export async function appendDeviceConversationMessage(
  redis: DeviceHistoryStore,
  username: string,
  message: DeviceConversationMessage,
  options: { limit?: number; ttlSeconds?: number } = {}
): Promise<void> {
  const limit = options.limit ?? DEVICE_HISTORY_LIMIT;
  const ttlSeconds = options.ttlSeconds ?? DEVICE_HISTORY_TTL_SECONDS;
  const key = buildDeviceHistoryKey(username);
  await redis.lpush(key, JSON.stringify(message));
  await redis.ltrim(key, 0, limit - 1);
  await redis.expire(key, ttlSeconds);
}

export async function clearDeviceConversationHistory(
  redis: DeviceHistoryStore,
  username: string
): Promise<void> {
  await redis.del(buildDeviceHistoryKey(username));
}
