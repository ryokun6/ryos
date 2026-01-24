/**
 * Redis helper functions for IRC API
 */

import { Redis } from "@upstash/redis";
import type { IrcServerConfig, IrcChannelData, IrcMessageData } from "./_types.js";
import { IRC_SERVER_PREFIX, IRC_CHANNEL_PREFIX, IRC_MESSAGE_PREFIX, IRC_SERVERS_SET } from "./_constants.js";

/**
 * Create a Redis client instance
 */
function createRedisClient(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export { createRedisClient };

/**
 * Generate a unique ID
 */
export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Get current timestamp in milliseconds
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Parse JSON data safely
 */
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

/**
 * Get IRC server config from Redis
 */
export async function getIrcServer(serverId: string): Promise<IrcServerConfig | null> {
  const redis = createRedisClient();
  const key = `${IRC_SERVER_PREFIX}${serverId}`;
  const data = await redis.get(key);
  return parseJSON<IrcServerConfig>(data);
}

/**
 * Set IRC server config in Redis
 */
export async function setIrcServer(serverId: string, config: IrcServerConfig): Promise<void> {
  const redis = createRedisClient();
  const key = `${IRC_SERVER_PREFIX}${serverId}`;
  await redis.set(key, JSON.stringify(config));
  await redis.sadd(IRC_SERVERS_SET, serverId);
}

/**
 * Remove IRC server from Redis
 */
export async function removeIrcServer(serverId: string): Promise<void> {
  const redis = createRedisClient();
  const key = `${IRC_SERVER_PREFIX}${serverId}`;
  await redis.del(key);
  await redis.srem(IRC_SERVERS_SET, serverId);
}

/**
 * Get all IRC server IDs
 */
export async function getAllIrcServerIds(): Promise<string[]> {
  const redis = createRedisClient();
  const members = await redis.smembers(IRC_SERVERS_SET);
  return Array.isArray(members) ? members.map(String) : [];
}

/**
 * Get IRC channel data from Redis
 */
export async function getIrcChannel(serverId: string, channel: string): Promise<IrcChannelData | null> {
  const redis = createRedisClient();
  const key = `${IRC_CHANNEL_PREFIX}${serverId}:${channel}`;
  const data = await redis.get(key);
  return parseJSON<IrcChannelData>(data);
}

/**
 * Set IRC channel data in Redis
 */
export async function setIrcChannel(serverId: string, channel: string, data: IrcChannelData): Promise<void> {
  const redis = createRedisClient();
  const key = `${IRC_CHANNEL_PREFIX}${serverId}:${channel}`;
  await redis.set(key, JSON.stringify(data));
}

/**
 * Remove IRC channel from Redis
 */
export async function removeIrcChannel(serverId: string, channel: string): Promise<void> {
  const redis = createRedisClient();
  const key = `${IRC_CHANNEL_PREFIX}${serverId}:${channel}`;
  await redis.del(key);
}
