/**
 * Memory System - Redis Helpers
 * 
 * Provides per-user persistent memory storage for the Ryo AI agent.
 * Two-tier system:
 * 
 * **Daily Notes** (Tier 1 - Journal):
 * - Append-only entries collected throughout the day
 * - Captures observations, context, passing details from conversations
 * - Recent notes (last 3 days) are shown in AI context
 * - Stored per-day in Redis, expire after 30 days
 * 
 * **Long-Term Memories** (Tier 2 - Permanent):
 * - Stable facts extracted from daily notes or explicitly saved
 * - Two-layer: Index (keys + summaries always visible) + Details (on-demand)
 * - Updated via extraction from daily notes or direct user request
 */

import type { Redis } from "./redis.js";
import { redisKeys } from "../../src/shared/redisKeys.js";
import { getStoredUserRecord } from "./auth/_user-record.js";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of long-term memories per user */
export const MAX_MEMORIES_PER_USER = 50;

/** Maximum length for memory key */
export const MAX_KEY_LENGTH = 30;

/** Maximum length for memory summary */
export const MAX_SUMMARY_LENGTH = 180;

/** Maximum length for memory content */
export const MAX_CONTENT_LENGTH = 2000;

/** Maximum length for a single daily note entry */
export const MAX_DAILY_NOTE_ENTRY_LENGTH = 500;

/** Maximum number of entries per daily note */
export const MAX_DAILY_NOTE_ENTRIES = 50;

/** Number of recent days of daily notes to show in AI context */
export const DAILY_NOTES_CONTEXT_DAYS = 3;

/** TTL for daily notes in seconds (30 days) */
export const DAILY_NOTES_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Current schema version for migrations */
export const MEMORY_SCHEMA_VERSION = 1;

/** Default timezone when user timezone is unavailable or invalid */
export const DEFAULT_MEMORY_TIME_ZONE = "UTC";

/** Retention window for temporary long-term memories */
export const TEMPORARY_MEMORY_RETENTION_DAYS = 7;

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MEMORY_MUTATION_LOCK_TTL_SECONDS = 120;
const MEMORY_MUTATION_LOCK_ATTEMPTS = 400;
const MEMORY_MUTATION_LOCK_RETRY_MS = 25;
const MEMORY_PURGE_DELETE_BATCH_SIZE = 500;
const MAX_RECENT_MEMORY_OPERATION_IDS = 32;
const MAX_MEMORY_OPERATION_ID_LENGTH = 200;

const TEMPORARY_MEMORY_KEY_HINTS = new Set(["context", "current_focus"]);

const TEMPORARY_TOPIC_PATTERN = /\b(travel|trip|vacation|holiday|flight|hotel|itinerary|meeting|meetings|appointment|conference|event)\b/i;
const TEMPORAL_MARKER_PATTERN = /\b(today|tonight|tomorrow|yesterday|this week|next week|last week|recent|recently|upcoming|currently)\b/i;

/**
 * Canonical long-term memory keys that the AI should prefer.
 * These are stable identifiers for common memory categories.
 * AI handles matching related topics to these keys.
 */
export const CANONICAL_MEMORY_KEYS = [
  // Identity
  "name",           // User's name, nickname, how to address them
  "birthday",       // Birthday, age
  "location",       // Where they live, timezone
  
  // Work & Education  
  "work",           // Job, company, role, career context
  "skills",         // Skills, expertise, tech stack
  "education",      // School, degree, field of study
  "projects",       // Current projects, side projects
  
  // Interests & Preferences
  "music_pref",     // Music taste, favorite artists/bands
  "food_pref",      // Food preferences, diet, favorite cuisines
  "interests",      // Hobbies, general interests
  "entertainment",  // Movies, shows, games, books
  
  // Relationships
  "family",         // Family members
  "friends",        // Friends, social connections
  "pets",           // Pets, animals
  
  // Goals & Context
  "goals",          // Goals, aspirations, plans
  "current_focus",  // What they're working on now
  "context",        // Important ongoing life context
  
  // Meta
  "preferences",    // General preferences, likes/dislikes
  "instructions",   // How to respond, communication style
] as const;

// ============================================================================
// Key Patterns
// ============================================================================

/**
 * Get Redis key for user's long-term memory index
 */
export const getMemoryIndexKey = (username: string): string =>
  redisKeys.memory.index(username);

/**
 * Get Redis key for a specific long-term memory detail
 */
export const getMemoryDetailKey = (username: string, key: string): string =>
  redisKeys.memory.detail(username, key);

/**
 * Get Redis key for a user's daily note for a specific date
 * @param date - Date string in YYYY-MM-DD format
 */
export const getDailyNoteKey = (username: string, date: string): string =>
  redisKeys.memory.daily(username, date);

/**
 * Get the owner-scoped index of daily-note dates.
 */
export const getDailyNoteDatesIndexKey = (username: string): string =>
  redisKeys.memory.dailyDates(username);

const RELEASE_MEMORY_MUTATION_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export async function withUserMemoryMutationLock<T>(
  redis: Redis,
  username: string,
  task: () => Promise<T>
): Promise<T> {
  const key = redisKeys.memory.mutationLock(username);
  const token = crypto.randomUUID();

  for (
    let attempt = 0;
    attempt < MEMORY_MUTATION_LOCK_ATTEMPTS;
    attempt += 1
  ) {
    const claimed = await redis.set(key, token, {
      nx: true,
      ex: MEMORY_MUTATION_LOCK_TTL_SECONDS,
    });
    if (claimed !== null && claimed !== undefined) {
      try {
        return await task();
      } finally {
        await redis
          .eval<number>(RELEASE_MEMORY_MUTATION_LOCK_SCRIPT, [key], [token])
          .catch(() => 0);
      }
    }
    await sleep(MEMORY_MUTATION_LOCK_RETRY_MS);
  }

  throw new Error("memory_mutation_busy");
}

export function isValidMemoryAccountCreatedAt(
  accountCreatedAt: unknown
): accountCreatedAt is number {
  return (
    typeof accountCreatedAt === "number" &&
    Number.isFinite(accountCreatedAt) &&
    accountCreatedAt > 0
  );
}

export async function isCurrentMemoryAccount({
  redis,
  username,
  accountCreatedAt,
}: {
  redis: Redis;
  username: string;
  accountCreatedAt: unknown;
}): Promise<boolean> {
  if (!isValidMemoryAccountCreatedAt(accountCreatedAt)) {
    return false;
  }

  const [tombstone, account] = await Promise.all([
    redis.get(redisKeys.chat.aiConversationTombstone(username)),
    getStoredUserRecord(redis, username),
  ]);
  return (
    tombstone === null &&
    isValidMemoryAccountCreatedAt(account?.createdAt) &&
    account.createdAt === accountCreatedAt
  );
}

export type CurrentAccountMemoryMutationResult<T> =
  | { status: "applied"; value: T }
  | { status: "account_changed" };

export async function withCurrentAccountMemoryMutation<T>({
  redis,
  username,
  accountCreatedAt,
  mutation,
}: {
  redis: Redis;
  username: string;
  accountCreatedAt: unknown;
  mutation: () => Promise<T>;
}): Promise<CurrentAccountMemoryMutationResult<T>> {
  if (!isValidMemoryAccountCreatedAt(accountCreatedAt)) {
    return { status: "account_changed" };
  }

  return withUserMemoryMutationLock(redis, username, async () => {
    if (
      !(await isCurrentMemoryAccount({
        redis,
        username,
        accountCreatedAt,
      }))
    ) {
      return { status: "account_changed" };
    }
    return { status: "applied", value: await mutation() };
  });
}

/**
 * Get today's date in YYYY-MM-DD format (in user's approximate timezone, defaults to UTC)
 */
export function normalizeTimeZone(timeZone?: string | null): string {
  if (!timeZone || typeof timeZone !== "string") {
    return DEFAULT_MEMORY_TIME_ZONE;
  }

  const trimmed = timeZone.trim();
  if (!trimmed) {
    return DEFAULT_MEMORY_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return DEFAULT_MEMORY_TIME_ZONE;
  }
}

function getDateStringInTimeZone(date: Date, timeZone: string): string {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: resolvedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  if (year && month && day) {
    return `${year}-${month}-${day}`;
  }

  // Safe fallback for unexpected runtime format behavior
  return date.toISOString().split("T")[0];
}

function shiftDateString(dateString: string, daysOffset: number): string {
  const [yearString, monthString, dayString] = dateString.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  if (!year || !month || !day) {
    return dateString;
  }

  const shifted = new Date(Date.UTC(year, month - 1, day + daysOffset));
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

function getTimeStringInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: normalizeTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export interface TimestampMetadata {
  isoTimestamp: string;
  localDate: string;
  localTime: string;
  timeZone: string;
}

export function buildTimestampMetadata(timestamp: number, timeZone?: string): TimestampMetadata {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const date = new Date(timestamp);
  return {
    isoTimestamp: date.toISOString(),
    localDate: getDateStringInTimeZone(date, resolvedTimeZone),
    localTime: getTimeStringInTimeZone(date, resolvedTimeZone),
    timeZone: resolvedTimeZone,
  };
}

/**
 * Get today's date in YYYY-MM-DD format in the given timezone (defaults to UTC).
 */
export function getTodayDateString(timeZone?: string): string {
  return getDateStringInTimeZone(new Date(), normalizeTimeZone(timeZone));
}

/**
 * Get date strings for the last N days (including today)
 */
export function getRecentDateStrings(days: number, timeZone?: string): string[] {
  if (days <= 0) {
    return [];
  }

  const today = getTodayDateString(timeZone);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(shiftDateString(today, -i));
  }
  return dates;
}

// ============================================================================
// Types
// ============================================================================

// --- Long-Term Memory Types ---

/**
 * A single long-term memory entry in the index (Layer 1)
 */
export interface MemoryEntry {
  /** Short key identifying this memory (e.g., "name", "music_pref") */
  key: string;
  /** Brief 1-2 sentence summary */
  summary: string;
  /** Unix timestamp of last update */
  updatedAt: number;
}

/**
 * The user's long-term memory index containing all memory summaries
 */
export interface MemoryIndex {
  /** Array of memory entries */
  memories: MemoryEntry[];
  /** Schema version for future migrations */
  version: number;
}

/**
 * Full long-term memory detail (Layer 2)
 */
export interface MemoryDetail {
  /** Memory key */
  key: string;
  /** Full detailed content */
  content: string;
  /** Unix timestamp of creation */
  createdAt: number;
  /** Unix timestamp of last update */
  updatedAt: number;
  /** Recent idempotency identifiers for scoped memory mutations */
  recentOperationIds?: string[];
}

/**
 * Result of a memory operation
 */
export interface MemoryOperationResult {
  success: boolean;
  message: string;
  entry?: MemoryEntry;
  /** False when an already-applied operation was safely ignored */
  applied?: boolean;
}

export interface MemoryMutationOptions {
  operationId?: string;
}

// --- Daily Notes Types ---

/**
 * A single entry in a daily note
 */
export interface DailyNoteEntry {
  /** Unix timestamp for the source event this note refers to */
  timestamp: number;
  /** ISO 8601 UTC timestamp (e.g. 2026-02-28T08:21:32.000Z) */
  isoTimestamp?: string;
  /** Local date in the user's timezone (YYYY-MM-DD) */
  localDate?: string;
  /** Local time in the user's timezone (HH:mm:ss, 24-hour) */
  localTime?: string;
  /** IANA timezone used for localDate/localTime */
  timeZone?: string;
  /** The note content (observation, context, detail) */
  content: string;
  /** Optional idempotency identifier for the append operation */
  operationId?: string;
}

/**
 * A daily note document for a single day
 */
export interface DailyNote {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** IANA timezone used to bucket this note's date */
  timeZone?: string;
  /** Array of entries collected throughout the day */
  entries: DailyNoteEntry[];
  /** Whether long-term memory extraction has been run on this note */
  processedForMemories: boolean;
  /** Unix timestamp of last update */
  updatedAt: number;
}

/**
 * Result of a daily note operation
 */
export interface DailyNoteOperationResult {
  success: boolean;
  message: string;
  date?: string;
  entryCount?: number;
  /** False when an already-applied operation was safely ignored */
  applied?: boolean;
}

export interface DailyNoteAppendOptions {
  /** User's IANA timezone (e.g. "Asia/Tokyo") */
  timeZone?: string;
  /** Source event timestamp to preserve instead of using ingestion time */
  timestamp?: number;
  /** Optional idempotency identifier for this append */
  operationId?: string;
}

function normalizeMemoryOperationId(operationId?: string): string | undefined {
  if (typeof operationId !== "string") {
    return undefined;
  }
  const normalized = operationId.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, MAX_MEMORY_OPERATION_ID_LENGTH);
}

function getRecentMemoryOperationIds(
  detail: MemoryDetail | null
): string[] {
  if (!Array.isArray(detail?.recentOperationIds)) {
    return [];
  }
  return detail.recentOperationIds.filter(
    (operationId): operationId is string =>
      typeof operationId === "string" && operationId.length > 0
  );
}

function hasMemoryOperation(
  detail: MemoryDetail | null,
  operationId?: string
): boolean {
  return (
    operationId !== undefined &&
    getRecentMemoryOperationIds(detail).includes(operationId)
  );
}

function appendMemoryOperation(
  detail: MemoryDetail | null,
  operationId?: string
): string[] | undefined {
  const existing = getRecentMemoryOperationIds(detail);
  if (!operationId) {
    return existing.length > 0 ? existing : undefined;
  }
  return [
    ...existing.filter((candidate) => candidate !== operationId),
    operationId,
  ].slice(-MAX_RECENT_MEMORY_OPERATION_IDS);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a memory key
 */
export function isValidMemoryKey(key: string): boolean {
  if (!key || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    return false;
  }
  // Must start with letter, contain only lowercase letters, numbers, underscores
  return /^[a-z][a-z0-9_]*$/.test(key);
}

/**
 * Normalize a memory key (lowercase, trim)
 */
export function normalizeMemoryKey(key: string): string {
  return key.toLowerCase().trim();
}

// ============================================================================
// Index Operations
// ============================================================================

/**
 * Get the user's memory index
 */
export async function getMemoryIndex(
  redis: Redis,
  username: string
): Promise<MemoryIndex | null> {
  const key = getMemoryIndexKey(username);
  const data = await redis.get<MemoryIndex | string>(key);
  
  if (!data) {
    return null;
  }

  // Handle both string and object responses from Redis
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as MemoryIndex;
    } catch {
      return null;
    }
  }

  return data;
}

/**
 * Save the user's memory index
 */
export async function saveMemoryIndex(
  redis: Redis,
  username: string,
  index: MemoryIndex
): Promise<void> {
  const key = getMemoryIndexKey(username);
  await redis.set(key, JSON.stringify(index));
}

/**
 * Get or create the user's memory index
 */
export async function getOrCreateMemoryIndex(
  redis: Redis,
  username: string
): Promise<MemoryIndex> {
  const existing = await getMemoryIndex(redis, username);
  if (existing) {
    return existing;
  }
  return {
    memories: [],
    version: MEMORY_SCHEMA_VERSION,
  };
}

// ============================================================================
// Detail Operations
// ============================================================================

/**
 * Get full memory detail by key
 */
export async function getMemoryDetail(
  redis: Redis,
  username: string,
  memoryKey: string
): Promise<MemoryDetail | null> {
  const key = getMemoryDetailKey(username, memoryKey);
  const data = await redis.get<MemoryDetail | string>(key);
  
  if (!data) {
    return null;
  }

  // Handle both string and object responses from Redis
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as MemoryDetail;
    } catch {
      return null;
    }
  }

  return data;
}

/**
 * Save memory detail
 */
export async function saveMemoryDetail(
  redis: Redis,
  username: string,
  detail: MemoryDetail
): Promise<void> {
  const key = getMemoryDetailKey(username, detail.key);
  await redis.set(key, JSON.stringify(detail));
}

const SAVE_MEMORY_RECORD_SCRIPT = `
redis.call("SET", KEYS[1], ARGV[1])
redis.call("SET", KEYS[2], ARGV[2])
return 1
`;

async function saveMemoryRecord(
  redis: Redis,
  username: string,
  index: MemoryIndex,
  detail: MemoryDetail
): Promise<void> {
  await redis.eval(
    SAVE_MEMORY_RECORD_SCRIPT,
    [getMemoryIndexKey(username), getMemoryDetailKey(username, detail.key)],
    [JSON.stringify(index), JSON.stringify(detail)]
  );
}

/**
 * Delete memory detail
 */
export async function deleteMemoryDetail(
  redis: Redis,
  username: string,
  memoryKey: string
): Promise<void> {
  const key = getMemoryDetailKey(username, memoryKey);
  await redis.del(key);
}

// ============================================================================
// High-Level Operations
// ============================================================================

/**
 * Add a new memory (fails if key already exists)
 */
export async function addMemory(
  redis: Redis,
  username: string,
  memoryKey: string,
  summary: string,
  content: string,
  options: MemoryMutationOptions = {}
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const operationId = normalizeMemoryOperationId(options.operationId);

  // Validate key
  if (!isValidMemoryKey(normalizedKey)) {
    return {
      success: false,
      message: `Invalid memory key "${memoryKey}". Must be 1-${MAX_KEY_LENGTH} chars, start with letter, contain only lowercase letters, numbers, underscores.`,
    };
  }

  // Validate summary length
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return {
      success: false,
      message: `Summary too long (${summary.length} chars). Maximum is ${MAX_SUMMARY_LENGTH} chars.`,
    };
  }

  // Validate content length
  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      success: false,
      message: `Content too long (${content.length} chars). Maximum is ${MAX_CONTENT_LENGTH} chars.`,
    };
  }

  // Get current index
  const index = await getOrCreateMemoryIndex(redis, username);

  // Check if key already exists
  const existingIdx = index.memories.findIndex((m) => m.key === normalizedKey);
  const existingDetail = operationId
    ? await getMemoryDetail(redis, username, normalizedKey)
    : null;
  if (hasMemoryOperation(existingDetail, operationId)) {
    let entry = index.memories[existingIdx];
    if (!entry) {
      entry = {
        key: normalizedKey,
        summary: summary.trim(),
        updatedAt: existingDetail?.updatedAt ?? Date.now(),
      };
      index.memories.push(entry);
      await saveMemoryIndex(redis, username, index);
    }
    return {
      success: true,
      message: `Memory "${normalizedKey}" operation was already applied.`,
      entry,
      applied: false,
    };
  }
  if (existingIdx !== -1) {
    return {
      success: false,
      message: `Memory with key "${normalizedKey}" already exists. Use mode "update" or "merge" to modify it.`,
    };
  }

  // Check max memories limit
  if (index.memories.length >= MAX_MEMORIES_PER_USER) {
    return {
      success: false,
      message: `Maximum memories limit reached (${MAX_MEMORIES_PER_USER}). Delete some memories first.`,
    };
  }

  const now = Date.now();

  // Create entry
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
  };
  const recentOperationIds = appendMemoryOperation(null, operationId);

  // Create detail
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
    ...(recentOperationIds ? { recentOperationIds } : {}),
  };

  index.memories.push(entry);
  await saveMemoryRecord(redis, username, index, detail);

  return {
    success: true,
    message: `Memory "${normalizedKey}" created successfully.`,
    entry,
  };
}

/**
 * Update an existing memory (fails if key doesn't exist)
 */
export async function updateMemory(
  redis: Redis,
  username: string,
  memoryKey: string,
  summary: string,
  content: string,
  options: MemoryMutationOptions = {}
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const operationId = normalizeMemoryOperationId(options.operationId);

  // Validate key
  if (!isValidMemoryKey(normalizedKey)) {
    return {
      success: false,
      message: `Invalid memory key "${memoryKey}".`,
    };
  }

  // Validate summary length
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return {
      success: false,
      message: `Summary too long (${summary.length} chars). Maximum is ${MAX_SUMMARY_LENGTH} chars.`,
    };
  }

  // Validate content length
  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      success: false,
      message: `Content too long (${content.length} chars). Maximum is ${MAX_CONTENT_LENGTH} chars.`,
    };
  }

  // Get current index
  const index = await getOrCreateMemoryIndex(redis, username);

  // Find existing entry
  const existingIdx = index.memories.findIndex((m) => m.key === normalizedKey);
  if (existingIdx === -1) {
    return {
      success: false,
      message: `Memory with key "${normalizedKey}" not found. Use mode "add" to create it.`,
    };
  }

  const now = Date.now();
  const existingDetail = await getMemoryDetail(redis, username, normalizedKey);

  // Update entry
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
  };

  if (hasMemoryOperation(existingDetail, operationId)) {
    return {
      success: true,
      message: `Memory "${normalizedKey}" operation was already applied.`,
      entry: index.memories[existingIdx],
      applied: false,
    };
  }

  const createdAt = existingDetail?.createdAt || now;
  const recentOperationIds = appendMemoryOperation(
    existingDetail,
    operationId
  );

  // Update detail
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: content.trim(),
    createdAt,
    updatedAt: now,
    ...(recentOperationIds ? { recentOperationIds } : {}),
  };

  index.memories[existingIdx] = entry;
  await saveMemoryRecord(redis, username, index, detail);

  return {
    success: true,
    message: `Memory "${normalizedKey}" updated successfully.`,
    entry,
  };
}

/**
 * Merge with existing memory (append content) or create new
 */
export async function mergeMemory(
  redis: Redis,
  username: string,
  memoryKey: string,
  summary: string,
  content: string,
  options: MemoryMutationOptions = {}
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const operationId = normalizeMemoryOperationId(options.operationId);

  // Validate key
  if (!isValidMemoryKey(normalizedKey)) {
    return {
      success: false,
      message: `Invalid memory key "${memoryKey}".`,
    };
  }

  // Get current index
  const index = await getOrCreateMemoryIndex(redis, username);

  // Find existing entry
  const existingIdx = index.memories.findIndex((m) => m.key === normalizedKey);

  if (existingIdx === -1) {
    // Key doesn't exist - create new
    return addMemory(redis, username, memoryKey, summary, content, options);
  }

  // Key exists - merge content
  const existingDetail = await getMemoryDetail(redis, username, normalizedKey);
  if (hasMemoryOperation(existingDetail, operationId)) {
    return {
      success: true,
      message: `Memory "${normalizedKey}" operation was already applied.`,
      entry: index.memories[existingIdx],
      applied: false,
    };
  }
  const existingContent = existingDetail?.content || "";
  const mergedContent = existingContent
    ? `${existingContent}\n\n---\n\n${content.trim()}`
    : content.trim();

  // Validate merged content length
  if (mergedContent.length > MAX_CONTENT_LENGTH) {
    return {
      success: false,
      message: `Merged content would be too long (${mergedContent.length} chars). Maximum is ${MAX_CONTENT_LENGTH} chars. Use mode "update" to replace instead.`,
    };
  }

  // Validate summary length
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return {
      success: false,
      message: `Summary too long (${summary.length} chars). Maximum is ${MAX_SUMMARY_LENGTH} chars.`,
    };
  }

  const now = Date.now();

  // Update entry with new summary
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
  };
  const recentOperationIds = appendMemoryOperation(
    existingDetail,
    operationId
  );

  // Update detail with merged content
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: mergedContent,
    createdAt: existingDetail?.createdAt || now,
    updatedAt: now,
    ...(recentOperationIds ? { recentOperationIds } : {}),
  };

  index.memories[existingIdx] = entry;
  await saveMemoryRecord(redis, username, index, detail);

  return {
    success: true,
    message: `Memory "${normalizedKey}" merged successfully.`,
    entry,
  };
}

/**
 * Delete a memory
 */
export async function deleteMemory(
  redis: Redis,
  username: string,
  memoryKey: string
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);

  // Get current index
  const index = await getOrCreateMemoryIndex(redis, username);

  // Find existing entry
  const existingIdx = index.memories.findIndex((m) => m.key === normalizedKey);
  if (existingIdx === -1) {
    return {
      success: false,
      message: `Memory with key "${normalizedKey}" not found.`,
    };
  }

  // Remove from index
  index.memories.splice(existingIdx, 1);
  await saveMemoryIndex(redis, username, index);

  // Delete detail
  await deleteMemoryDetail(redis, username, normalizedKey);

  return {
    success: true,
    message: `Memory "${normalizedKey}" deleted successfully.`,
  };
}

/**
 * Unified upsert function that handles all modes
 */
export async function upsertMemory(
  redis: Redis,
  username: string,
  memoryKey: string,
  summary: string,
  content: string,
  mode: "add" | "update" | "merge" = "add",
  options: MemoryMutationOptions = {}
): Promise<MemoryOperationResult> {
  switch (mode) {
    case "add":
      return addMemory(redis, username, memoryKey, summary, content, options);
    case "update":
      return updateMemory(redis, username, memoryKey, summary, content, options);
    case "merge":
      return mergeMemory(redis, username, memoryKey, summary, content, options);
    default:
      return {
        success: false,
        message: `Invalid mode "${mode}". Use "add", "update", or "merge".`,
      };
  }
}

/**
 * List all memory keys for a user
 */
export async function listMemoryKeys(
  redis: Redis,
  username: string
): Promise<string[]> {
  const index = await getMemoryIndex(redis, username);
  if (!index) {
    return [];
  }
  return index.memories.map((m) => m.key);
}

/**
 * Get memory summaries for system prompt injection
 * Returns a formatted string for inclusion in AI context
 */
export async function getMemorySummariesForPrompt(
  redis: Redis,
  username: string
): Promise<string | null> {
  const index = await getMemoryIndex(redis, username);
  if (!index || index.memories.length === 0) {
    return null;
  }

  const lines = index.memories.map((m) => `- ${m.key}: ${m.summary}`);
  return lines.join("\n");
}

// ============================================================================
// Daily Notes Operations
// ============================================================================

const SAVE_DAILY_NOTE_SCRIPT = `
redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
redis.call("SADD", KEYS[2], ARGV[3])
redis.call("EXPIRE", KEYS[2], ARGV[2])
return 1
`;

/**
 * Get a daily note for a specific date
 */
export async function getDailyNote(
  redis: Redis,
  username: string,
  date: string
): Promise<DailyNote | null> {
  const key = getDailyNoteKey(username, date);
  const data = await redis.get<DailyNote | string>(key);

  if (!data) {
    return null;
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data) as DailyNote;
    } catch {
      return null;
    }
  }

  return data;
}

/**
 * Save a daily note (with TTL for auto-expiry)
 */
export async function saveDailyNote(
  redis: Redis,
  username: string,
  note: DailyNote
): Promise<void> {
  const key = getDailyNoteKey(username, note.date);
  const datesIndexKey = getDailyNoteDatesIndexKey(username);
  await redis.eval(
    SAVE_DAILY_NOTE_SCRIPT,
    [key, datesIndexKey],
    [JSON.stringify(note), DAILY_NOTES_TTL_SECONDS, note.date]
  );
}

/**
 * Append an entry to today's daily note
 */
export async function appendDailyNote(
  redis: Redis,
  username: string,
  content: string,
  options: DailyNoteAppendOptions = {}
): Promise<DailyNoteOperationResult> {
  const operationId = normalizeMemoryOperationId(options.operationId);

  // Validate content length
  if (!content || content.trim().length === 0) {
    return {
      success: false,
      message: "Daily note content cannot be empty.",
    };
  }

  if (content.length > MAX_DAILY_NOTE_ENTRY_LENGTH) {
    return {
      success: false,
      message: `Daily note entry too long (${content.length} chars). Maximum is ${MAX_DAILY_NOTE_ENTRY_LENGTH} chars.`,
    };
  }

  const resolvedTimeZone = normalizeTimeZone(options.timeZone);
  const sourceTimestamp =
    typeof options.timestamp === "number" && Number.isFinite(options.timestamp)
      ? options.timestamp
      : Date.now();
  const timestampMetadata = buildTimestampMetadata(
    sourceTimestamp,
    resolvedTimeZone
  );
  const noteDate = timestampMetadata.localDate;
  const existing = await getDailyNote(redis, username, noteDate);

  const now = Date.now();
  const entry: DailyNoteEntry = {
    timestamp: sourceTimestamp,
    isoTimestamp: timestampMetadata.isoTimestamp,
    localDate: timestampMetadata.localDate,
    localTime: timestampMetadata.localTime,
    timeZone: timestampMetadata.timeZone,
    content: content.trim(),
    ...(operationId ? { operationId } : {}),
  };

  if (existing) {
    if (
      operationId &&
      existing.entries.some((candidate) => candidate.operationId === operationId)
    ) {
      return {
        success: true,
        message: `Daily note operation for ${noteDate} was already applied.`,
        date: noteDate,
        entryCount: existing.entries.length,
        applied: false,
      };
    }

    // Check entry count limit
    if (existing.entries.length >= MAX_DAILY_NOTE_ENTRIES) {
      return {
        success: false,
        message: `Daily note limit reached (${MAX_DAILY_NOTE_ENTRIES} entries). Notes will reset tomorrow.`,
      };
    }

    existing.entries.push(entry);
    if (!existing.timeZone) {
      existing.timeZone = resolvedTimeZone;
    }
    existing.processedForMemories = false; // Reset so Phase 2 picks up new entries
    existing.updatedAt = now;
    await saveDailyNote(redis, username, existing);

    return {
      success: true,
      message: `Added to daily note for ${noteDate}.`,
      date: noteDate,
      entryCount: existing.entries.length,
    };
  }

  // Create new daily note
  const note: DailyNote = {
    date: noteDate,
    timeZone: resolvedTimeZone,
    entries: [entry],
    processedForMemories: false,
    updatedAt: now,
  };

  await saveDailyNote(redis, username, note);

  return {
    success: true,
    message: `Started daily note for ${noteDate}.`,
    date: noteDate,
    entryCount: 1,
  };
}

/**
 * Get recent daily notes for inclusion in AI context
 * Returns notes from the last N days
 */
export async function getRecentDailyNotes(
  redis: Redis,
  username: string,
  days: number = DAILY_NOTES_CONTEXT_DAYS,
  timeZone?: string
): Promise<DailyNote[]> {
  const dates = getRecentDateStrings(days, timeZone);
  const notes: DailyNote[] = [];

  for (const date of dates) {
    const note = await getDailyNote(redis, username, date);
    if (note && note.entries.length > 0) {
      notes.push(note);
    }
  }

  return notes;
}

/**
 * Get recent daily notes formatted for system prompt injection
 * Returns a formatted string for inclusion in AI context
 */
export async function getDailyNotesForPrompt(
  redis: Redis,
  username: string,
  timeZone?: string
): Promise<string | null> {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const notes = await getRecentDailyNotes(redis, username, DAILY_NOTES_CONTEXT_DAYS, resolvedTimeZone);
  if (notes.length === 0) {
    return null;
  }

  const sections: string[] = [];
  for (const note of notes) {
    const dateLabel = note.date === getTodayDateString(resolvedTimeZone) ? `${note.date} (today)` : note.date;
    const entries = note.entries
      .map((e) => {
        const entryTimeZone = normalizeTimeZone(e.timeZone || note.timeZone || resolvedTimeZone);
        const localDate = e.localDate || getDateStringInTimeZone(new Date(e.timestamp), entryTimeZone);
        const localTime = e.localTime || getTimeStringInTimeZone(new Date(e.timestamp), entryTimeZone);
        return `  [${localDate} ${localTime} ${entryTimeZone}]: ${e.content}`;
      })
      .join("\n");
    sections.push(`${dateLabel}:\n${entries}`);
  }

  return sections.join("\n");
}

/**
 * Mark a daily note as processed for long-term memory extraction
 */
export async function markDailyNoteProcessed(
  redis: Redis,
  username: string,
  date: string
): Promise<void> {
  const note = await getDailyNote(redis, username, date);
  if (note) {
    note.processedForMemories = true;
    note.updatedAt = Date.now();
    await saveDailyNote(redis, username, note);
  }
}

/**
 * Get unprocessed daily notes (for long-term memory extraction)
 */
export async function getUnprocessedDailyNotes(
  redis: Redis,
  username: string,
  days: number = 7,
  timeZone?: string
): Promise<DailyNote[]> {
  const dates = getRecentDateStrings(days, timeZone);
  const notes: DailyNote[] = [];

  for (const date of dates) {
    const note = await getDailyNote(redis, username, date);
    if (note && !note.processedForMemories && note.entries.length > 0) {
      notes.push(note);
    }
  }

  return notes;
}

/**
 * Get unprocessed daily notes EXCLUDING today.
 * Today's note is still accumulating entries, so we only process past days.
 * This is the primary function for background daily-notes-to-long-term-memory processing.
 * 
 * Fetches all dates in parallel for efficiency.
 */
export async function getUnprocessedDailyNotesExcludingToday(
  redis: Redis,
  username: string,
  days: number = 7,
  timeZone?: string
): Promise<DailyNote[]> {
  const resolvedTimeZone = normalizeTimeZone(timeZone);
  const dates = getRecentDateStrings(days, resolvedTimeZone);
  const today = getTodayDateString(resolvedTimeZone);
  const pastDates = dates.filter(d => d !== today);

  // Fetch all dates in parallel instead of sequentially
  const allNotes = await Promise.all(
    pastDates.map(date => getDailyNote(redis, username, date))
  );

  return allNotes.filter(
    (note): note is DailyNote =>
      note !== null && !note.processedForMemories && note.entries.length > 0
  );
}

// ============================================================================
// Admin Operations
// ============================================================================

/**
 * Clear ALL long-term memories for a user (index + all detail keys).
 * Does NOT touch daily notes.
 */
export async function clearAllMemories(
  redis: Redis,
  username: string
): Promise<{ deletedCount: number }> {
  const index = await getMemoryIndex(redis, username);
  if (!index || index.memories.length === 0) {
    return { deletedCount: 0 };
  }

  const count = index.memories.length;

  // Delete all detail keys
  for (const entry of index.memories) {
    await deleteMemoryDetail(redis, username, entry.key);
  }

  // Clear the index
  const emptyIndex: MemoryIndex = {
    memories: [],
    version: MEMORY_SCHEMA_VERSION,
  };
  await saveMemoryIndex(redis, username, emptyIndex);

  return { deletedCount: count };
}

export async function deleteAllUserMemories(
  redis: Redis,
  username: string,
  now = Date.now()
): Promise<number> {
  return withUserMemoryMutationLock(redis, username, async () => {
    const dailyDatesIndexKey = getDailyNoteDatesIndexKey(username);
    const dailyNoteScanPattern = redisKeys.memory.daily(username, "*");
    const scannedDailyNoteKeys: string[] = [];
    let cursor: string | number = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: dailyNoteScanPattern,
        count: 100,
      });
      scannedDailyNoteKeys.push(...keys);
      cursor = nextCursor;
    } while (String(cursor) !== "0");

    const [index, indexedDailyDates] = await Promise.all([
      getMemoryIndex(redis, username),
      redis.smembers<string[]>(dailyDatesIndexKey),
    ]);
    const recentDailyDates = Array.from({ length: 34 }, (_, index) =>
      new Date(now - (index - 1) * DAY_IN_MS).toISOString().slice(0, 10)
    );
    const keysToDelete = [
      ...new Set([
        getMemoryIndexKey(username),
        dailyDatesIndexKey,
        ...(index?.memories ?? []).map((entry) =>
          getMemoryDetailKey(username, entry.key)
        ),
        ...indexedDailyDates.map((date) => getDailyNoteKey(username, date)),
        ...recentDailyDates.map((date) => getDailyNoteKey(username, date)),
        ...scannedDailyNoteKeys,
      ]),
    ];

    let deletedCount = 0;
    for (
      let offset = 0;
      offset < keysToDelete.length;
      offset += MEMORY_PURGE_DELETE_BATCH_SIZE
    ) {
      deletedCount += await redis.del(
        ...keysToDelete.slice(
          offset,
          offset + MEMORY_PURGE_DELETE_BATCH_SIZE
        )
      );
    }
    return deletedCount;
  });
}

/**
 * Reset all daily notes' processedForMemories flag to false.
 * This allows them to be re-processed by the daily notes processor.
 * Fetches all notes in parallel, then saves modified ones in parallel.
 * @param days - Number of past days to reset (default 30)
 */
export async function resetDailyNotesProcessedFlag(
  redis: Redis,
  username: string,
  days: number = 30,
  timeZone?: string
): Promise<{ resetCount: number }> {
  const dates = getRecentDateStrings(days, timeZone);

  // Fetch all notes in parallel
  const allNotes = await Promise.all(
    dates.map(date => getDailyNote(redis, username, date))
  );

  // Find notes that need resetting
  const notesToReset = allNotes.filter(
    (note): note is DailyNote =>
      note !== null && note.processedForMemories && note.entries.length > 0
  );

  if (notesToReset.length === 0) {
    return { resetCount: 0 };
  }

  // Reset and save all in parallel
  const now = Date.now();
  await Promise.all(
    notesToReset.map(note => {
      note.processedForMemories = false;
      note.updatedAt = now;
      return saveDailyNote(redis, username, note);
    })
  );

  return { resetCount: notesToReset.length };
}

// ============================================================================
// Long-Term Memory Hygiene
// ============================================================================

export interface TemporaryMemoryCleanupOptions {
  now?: number;
  retentionDays?: number;
}

export interface TemporaryMemoryCleanupResult {
  scanned: number;
  removed: number;
  removedKeys: string[];
  cutoffTimestamp: number;
}

function isLikelyTemporaryMemory(
  memoryKey: string,
  summary: string,
  content: string
): boolean {
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const text = `${summary} ${content}`;
  const hasTemporaryTopic = TEMPORARY_TOPIC_PATTERN.test(text);
  const hasTemporalMarker = TEMPORAL_MARKER_PATTERN.test(text);

  if (TEMPORARY_MEMORY_KEY_HINTS.has(normalizedKey)) {
    return hasTemporaryTopic || hasTemporalMarker;
  }

  return hasTemporaryTopic && hasTemporalMarker;
}

/**
 * Remove stale temporary memories that no longer belong in long-term memory.
 *
 * This is intended to run in long-term processing cycles so transient context
 * (e.g. "travel this week", "meeting tomorrow") does not stick around forever.
 */
export async function cleanupStaleTemporaryMemories(
  redis: Redis,
  username: string,
  options: TemporaryMemoryCleanupOptions = {}
): Promise<TemporaryMemoryCleanupResult> {
  const now = options.now ?? Date.now();
  const retentionDays = Math.max(1, options.retentionDays ?? TEMPORARY_MEMORY_RETENTION_DAYS);
  const cutoffTimestamp = now - retentionDays * DAY_IN_MS;

  const index = await getMemoryIndex(redis, username);
  if (!index || index.memories.length === 0) {
    return {
      scanned: 0,
      removed: 0,
      removedKeys: [],
      cutoffTimestamp,
    };
  }

  const staleCandidates = index.memories.filter((entry) => entry.updatedAt <= cutoffTimestamp);
  if (staleCandidates.length === 0) {
    return {
      scanned: 0,
      removed: 0,
      removedKeys: [],
      cutoffTimestamp,
    };
  }

  const candidateDetails = await Promise.all(
    staleCandidates.map(async (entry) => {
      const detail = await getMemoryDetail(redis, username, entry.key);
      return {
        key: entry.key,
        summary: entry.summary,
        content: detail?.content || "",
      };
    })
  );

  const removedKeys = candidateDetails.reduce<string[]>((acc, candidate) => {
    if (isLikelyTemporaryMemory(candidate.key, candidate.summary, candidate.content)) {
      acc.push(candidate.key);
    }
    return acc;
  }, []);

  if (removedKeys.length === 0) {
    return {
      scanned: staleCandidates.length,
      removed: 0,
      removedKeys: [],
      cutoffTimestamp,
    };
  }

  const keysToRemove = new Set(removedKeys);
  const filteredIndex: MemoryIndex = {
    ...index,
    memories: index.memories.filter((entry) => !keysToRemove.has(entry.key)),
  };

  await saveMemoryIndex(redis, username, filteredIndex);
  await Promise.all(
    removedKeys.map((key) => deleteMemoryDetail(redis, username, key))
  );

  return {
    scanned: staleCandidates.length,
    removed: removedKeys.length,
    removedKeys,
    cutoffTimestamp,
  };
}
