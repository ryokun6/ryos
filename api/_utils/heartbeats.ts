import type { Redis } from "./redis.js";
import {
  buildTimestampMetadata,
  getRecentDateStrings,
  normalizeTimeZone,
} from "./_memory.js";

export const HEARTBEATS_TTL_SECONDS = 30 * 24 * 60 * 60;
export const HEARTBEATS_SCHEMA_VERSION = 1;

export interface HeartbeatRecord {
  id: string;
  timestamp: number;
  isoTimestamp?: string;
  localDate?: string;
  localTime?: string;
  timeZone?: string;
  shouldSend: boolean;
  topic: string;
  message: string | null;
  skipReason: string | null;
  stateSummary: string;
}

export interface HeartbeatsStore {
  date: string;
  timeZone?: string;
  entries: HeartbeatRecord[];
  updatedAt: number;
  version: number;
}

export interface AppendHeartbeatRecordInput {
  timestamp?: number;
  shouldSend: boolean;
  topic: string;
  message?: string | null;
  skipReason?: string | null;
  stateSummary: string;
  timeZone?: string;
}

export const getHeartbeatsKey = (username: string, date: string): string =>
  `system:user:${username.toLowerCase()}:heartbeats:${date}`;

function normalizeOptionalText(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getHeartbeatsStore(
  redis: Redis,
  username: string,
  date: string
): Promise<HeartbeatsStore | null> {
  const key = getHeartbeatsKey(username, date);
  const data = await redis.get<HeartbeatsStore | string>(key);

  if (!data) {
    return null;
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data) as HeartbeatsStore;
    } catch {
      return null;
    }
  }

  return data;
}

export async function saveHeartbeatsStore(
  redis: Redis,
  username: string,
  store: HeartbeatsStore
): Promise<void> {
  const key = getHeartbeatsKey(username, store.date);
  await redis.set(key, JSON.stringify(store), { ex: HEARTBEATS_TTL_SECONDS });
}

export async function appendHeartbeatRecord(
  redis: Redis,
  username: string,
  input: AppendHeartbeatRecordInput
): Promise<HeartbeatRecord> {
  const now = input.timestamp ?? Date.now();
  const resolvedTimeZone = normalizeTimeZone(input.timeZone);
  const timestampMetadata = buildTimestampMetadata(now, resolvedTimeZone);
  const date = timestampMetadata.localDate;
  const existing = await getHeartbeatsStore(redis, username, date);

  const entry: HeartbeatRecord = {
    id: crypto.randomUUID(),
    timestamp: now,
    isoTimestamp: timestampMetadata.isoTimestamp,
    localDate: timestampMetadata.localDate,
    localTime: timestampMetadata.localTime,
    timeZone: timestampMetadata.timeZone,
    shouldSend: input.shouldSend,
    topic: input.topic.trim(),
    message: normalizeOptionalText(input.message),
    skipReason: normalizeOptionalText(input.skipReason),
    stateSummary: input.stateSummary.trim(),
  };

  if (existing) {
    existing.entries.push(entry);
    existing.updatedAt = now;
    if (!existing.timeZone) {
      existing.timeZone = resolvedTimeZone;
    }
    if (!existing.version) {
      existing.version = HEARTBEATS_SCHEMA_VERSION;
    }
    await saveHeartbeatsStore(redis, username, existing);
    return entry;
  }

  await saveHeartbeatsStore(redis, username, {
    date,
    timeZone: resolvedTimeZone,
    entries: [entry],
    updatedAt: now,
    version: HEARTBEATS_SCHEMA_VERSION,
  });
  return entry;
}

export async function getHeartbeatRecordsForDate(
  redis: Redis,
  username: string,
  date: string,
  topic?: string
): Promise<HeartbeatRecord[]> {
  const store = await getHeartbeatsStore(redis, username, date);
  if (!store || store.entries.length === 0) {
    return [];
  }

  const normalizedTopic = normalizeOptionalText(topic)?.toLowerCase();
  const filteredEntries = normalizedTopic
    ? store.entries.filter((entry) => entry.topic.toLowerCase() === normalizedTopic)
    : store.entries;

  return filteredEntries.slice().sort((a, b) => a.timestamp - b.timestamp);
}

export async function getRecentHeartbeatRecords(
  redis: Redis,
  username: string,
  days: number,
  timeZone?: string,
  topic?: string
): Promise<HeartbeatRecord[]> {
  const dates = getRecentDateStrings(days, timeZone);
  const records = await Promise.all(
    dates.map((date) => getHeartbeatRecordsForDate(redis, username, date, topic))
  );

  return records.flat().sort((a, b) => a.timestamp - b.timestamp);
}
