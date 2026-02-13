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

import type { Redis } from "@upstash/redis";

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
  `memory:user:${username.toLowerCase()}:index`;

/**
 * Get Redis key for a specific long-term memory detail
 */
export const getMemoryDetailKey = (username: string, key: string): string =>
  `memory:user:${username.toLowerCase()}:detail:${key.toLowerCase()}`;

/**
 * Get Redis key for a user's daily note for a specific date
 * @param date - Date string in YYYY-MM-DD format
 */
export const getDailyNoteKey = (username: string, date: string): string =>
  `memory:user:${username.toLowerCase()}:daily:${date}`;

/**
 * Get today's date in YYYY-MM-DD format (in user's approximate timezone, defaults to UTC)
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Get date strings for the last N days (including today)
 */
export function getRecentDateStrings(days: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
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
}

/**
 * Result of a memory operation
 */
export interface MemoryOperationResult {
  success: boolean;
  message: string;
  entry?: MemoryEntry;
}

// --- Daily Notes Types ---

/**
 * A single entry in a daily note
 */
export interface DailyNoteEntry {
  /** Unix timestamp when this entry was added */
  timestamp: number;
  /** The note content (observation, context, detail) */
  content: string;
}

/**
 * A daily note document for a single day
 */
export interface DailyNote {
  /** Date in YYYY-MM-DD format */
  date: string;
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
  content: string
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);

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

  // Create detail
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  };

  // Save both
  index.memories.push(entry);
  await saveMemoryIndex(redis, username, index);
  await saveMemoryDetail(redis, username, detail);

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
  content: string
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);

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

  // Update entry
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
  };

  // Get existing detail for createdAt
  const existingDetail = await getMemoryDetail(redis, username, normalizedKey);
  const createdAt = existingDetail?.createdAt || now;

  // Update detail
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: content.trim(),
    createdAt,
    updatedAt: now,
  };

  // Save both
  index.memories[existingIdx] = entry;
  await saveMemoryIndex(redis, username, index);
  await saveMemoryDetail(redis, username, detail);

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
  content: string
): Promise<MemoryOperationResult> {
  const normalizedKey = normalizeMemoryKey(memoryKey);

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
    return addMemory(redis, username, memoryKey, summary, content);
  }

  // Key exists - merge content
  const existingDetail = await getMemoryDetail(redis, username, normalizedKey);
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

  // Update detail with merged content
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: mergedContent,
    createdAt: existingDetail?.createdAt || now,
    updatedAt: now,
  };

  // Save both
  index.memories[existingIdx] = entry;
  await saveMemoryIndex(redis, username, index);
  await saveMemoryDetail(redis, username, detail);

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
  mode: "add" | "update" | "merge" = "add"
): Promise<MemoryOperationResult> {
  switch (mode) {
    case "add":
      return addMemory(redis, username, memoryKey, summary, content);
    case "update":
      return updateMemory(redis, username, memoryKey, summary, content);
    case "merge":
      return mergeMemory(redis, username, memoryKey, summary, content);
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
  await redis.set(key, JSON.stringify(note), { ex: DAILY_NOTES_TTL_SECONDS });
}

/**
 * Append an entry to today's daily note
 */
export async function appendDailyNote(
  redis: Redis,
  username: string,
  content: string
): Promise<DailyNoteOperationResult> {
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

  const today = getTodayDateString();
  const existing = await getDailyNote(redis, username, today);

  const now = Date.now();
  const entry: DailyNoteEntry = {
    timestamp: now,
    content: content.trim(),
  };

  if (existing) {
    // Check entry count limit
    if (existing.entries.length >= MAX_DAILY_NOTE_ENTRIES) {
      return {
        success: false,
        message: `Daily note limit reached (${MAX_DAILY_NOTE_ENTRIES} entries). Notes will reset tomorrow.`,
      };
    }

    existing.entries.push(entry);
    existing.processedForMemories = false; // Reset so Phase 2 picks up new entries
    existing.updatedAt = now;
    await saveDailyNote(redis, username, existing);

    return {
      success: true,
      message: `Added to daily note for ${today}.`,
      date: today,
      entryCount: existing.entries.length,
    };
  }

  // Create new daily note
  const note: DailyNote = {
    date: today,
    entries: [entry],
    processedForMemories: false,
    updatedAt: now,
  };

  await saveDailyNote(redis, username, note);

  return {
    success: true,
    message: `Started daily note for ${today}.`,
    date: today,
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
  days: number = DAILY_NOTES_CONTEXT_DAYS
): Promise<DailyNote[]> {
  const dates = getRecentDateStrings(days);
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
  username: string
): Promise<string | null> {
  const notes = await getRecentDailyNotes(redis, username);
  if (notes.length === 0) {
    return null;
  }

  const sections: string[] = [];
  for (const note of notes) {
    const dateLabel = note.date === getTodayDateString() ? `${note.date} (today)` : note.date;
    const entries = note.entries
      .map((e) => {
        const time = new Date(e.timestamp).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return `  ${time}: ${e.content}`;
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
  days: number = 7
): Promise<DailyNote[]> {
  const dates = getRecentDateStrings(days);
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
  days: number = 7
): Promise<DailyNote[]> {
  const dates = getRecentDateStrings(days);
  const today = getTodayDateString();
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

/**
 * Reset all daily notes' processedForMemories flag to false.
 * This allows them to be re-processed by the daily notes processor.
 * Fetches all notes in parallel, then saves modified ones in parallel.
 * @param days - Number of past days to reset (default 30)
 */
export async function resetDailyNotesProcessedFlag(
  redis: Redis,
  username: string,
  days: number = 30
): Promise<{ resetCount: number }> {
  const dates = getRecentDateStrings(days);

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
