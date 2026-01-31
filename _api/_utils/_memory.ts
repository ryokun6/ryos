/**
 * Memory System - Redis Helpers
 * 
 * Provides per-user persistent memory storage for the Ryo AI agent.
 * Two-layer system:
 * - Layer 1 (Index): Short keys + summaries always visible to AI
 * - Layer 2 (Details): Full content retrieved on-demand
 */

import type { Redis } from "@upstash/redis";

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of memories per user */
export const MAX_MEMORIES_PER_USER = 50;

/** Maximum length for memory key */
export const MAX_KEY_LENGTH = 30;

/** Maximum length for memory summary */
export const MAX_SUMMARY_LENGTH = 180;

/** Maximum length for memory content */
export const MAX_CONTENT_LENGTH = 2000;

/** Current schema version for migrations */
export const MEMORY_SCHEMA_VERSION = 2;

/** Default expiration for short-term memories (7 days) */
export const DEFAULT_SHORTTERM_TTL_DAYS = 7;
export const DEFAULT_SHORTTERM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Memory type: longterm (permanent) or shortterm (expires) */
export type MemoryType = "longterm" | "shortterm";

/**
 * Canonical memory keys that the AI should prefer.
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

/**
 * Canonical keys that default to longterm (permanent facts).
 * These represent stable information that rarely changes.
 */
export const LONGTERM_CANONICAL_KEYS = [
  "name",
  "birthday", 
  "location",
  "work",
  "skills",
  "education",
  "music_pref",
  "food_pref",
  "interests",
  "entertainment",
  "family",
  "friends",
  "pets",
  "goals",
  "preferences",
  "instructions",
] as const;

/**
 * Canonical keys that default to shortterm (temporary/current info).
 * These represent current state that may change frequently.
 */
export const SHORTTERM_CANONICAL_KEYS = [
  "current_focus",
  "context",
  "projects",
] as const;

/**
 * Get the default memory type for a given key.
 * Returns 'shortterm' for keys in SHORTTERM_CANONICAL_KEYS, 'longterm' otherwise.
 */
export function getDefaultMemoryType(key: string): MemoryType {
  const normalizedKey = key.toLowerCase();
  if ((SHORTTERM_CANONICAL_KEYS as readonly string[]).includes(normalizedKey)) {
    return "shortterm";
  }
  return "longterm";
}

// ============================================================================
// Key Patterns
// ============================================================================

/**
 * Get Redis key for user's memory index
 */
export const getMemoryIndexKey = (username: string): string =>
  `memory:user:${username.toLowerCase()}:index`;

/**
 * Get Redis key for a specific memory detail
 */
export const getMemoryDetailKey = (username: string, key: string): string =>
  `memory:user:${username.toLowerCase()}:detail:${key.toLowerCase()}`;

// ============================================================================
// Types
// ============================================================================

/**
 * A single memory entry in the index (Layer 1)
 */
export interface MemoryEntry {
  /** Short key identifying this memory (e.g., "name", "music_pref") */
  key: string;
  /** Brief 1-2 sentence summary */
  summary: string;
  /** Unix timestamp of last update */
  updatedAt: number;
  /** Memory type: longterm (permanent) or shortterm (temporary) */
  type: MemoryType;
  /** Unix timestamp when this memory expires (shortterm only) */
  expiresAt?: number;
}

/**
 * The user's memory index containing all memory summaries
 */
export interface MemoryIndex {
  /** Array of memory entries */
  memories: MemoryEntry[];
  /** Schema version for future migrations */
  version: number;
}

/**
 * Full memory detail (Layer 2)
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
  /** Memory type: longterm (permanent) or shortterm (temporary) */
  type: MemoryType;
  /** Unix timestamp when this memory expires (shortterm only) */
  expiresAt?: number;
}

/**
 * Result of a memory operation
 */
export interface MemoryOperationResult {
  success: boolean;
  message: string;
  entry?: MemoryEntry;
}

// ============================================================================
// Expiration Helpers
// ============================================================================

/**
 * Check if a memory entry is expired.
 * Only shortterm memories can expire.
 */
export function isMemoryExpired(entry: MemoryEntry): boolean {
  return (
    entry.type === "shortterm" &&
    entry.expiresAt !== undefined &&
    entry.expiresAt < Date.now()
  );
}

/**
 * Filter memories into active (non-expired) and expired lists.
 * Longterm memories are always active. Shortterm memories are active
 * if they have no expiresAt or expiresAt is in the future.
 */
export function filterActiveMemories(
  memories: MemoryEntry[]
): { active: MemoryEntry[]; expired: MemoryEntry[] } {
  const active: MemoryEntry[] = [];
  const expired: MemoryEntry[] = [];

  for (const entry of memories) {
    if (isMemoryExpired(entry)) {
      expired.push(entry);
    } else {
      active.push(entry);
    }
  }

  return { active, expired };
}

/**
 * Calculate expiration timestamp from days.
 */
export function calculateExpiresAt(days: number = DEFAULT_SHORTTERM_TTL_DAYS): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
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
 * Migrate a memory index from v1 to v2 schema.
 * V1 memories don't have a type field - we add 'longterm' as default.
 */
export function migrateMemoryIndex(index: MemoryIndex): MemoryIndex {
  if (index.version >= MEMORY_SCHEMA_VERSION) {
    return index;
  }

  // Migrate v1 -> v2: Add type field to all memories
  const migratedMemories = index.memories.map((entry) => {
    // If entry already has a type, keep it (shouldn't happen in v1)
    if ((entry as MemoryEntry).type) {
      return entry;
    }
    
    // Add type based on canonical key defaults
    return {
      ...entry,
      type: getDefaultMemoryType(entry.key),
      // No expiresAt for migrated memories - they become permanent longterm
    } as MemoryEntry;
  });

  return {
    memories: migratedMemories,
    version: MEMORY_SCHEMA_VERSION,
  };
}

/**
 * Get or create the user's memory index.
 * Automatically migrates v1 indexes to v2.
 */
export async function getOrCreateMemoryIndex(
  redis: Redis,
  username: string
): Promise<MemoryIndex> {
  const existing = await getMemoryIndex(redis, username);
  if (existing) {
    // Check if migration is needed
    if (existing.version < MEMORY_SCHEMA_VERSION) {
      const migrated = migrateMemoryIndex(existing);
      // Save migrated index
      await saveMemoryIndex(redis, username, migrated);
      return migrated;
    }
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
  content: string,
  type?: MemoryType,
  expiresAt?: number
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

  // Check if key already exists (including expired ones)
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
  
  // Determine memory type (use provided, or default based on key)
  const memoryType = type ?? getDefaultMemoryType(normalizedKey);
  
  // Calculate expiration for shortterm memories
  const finalExpiresAt = memoryType === "shortterm" 
    ? (expiresAt ?? calculateExpiresAt())
    : undefined;

  // Create entry
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
    type: memoryType,
    expiresAt: finalExpiresAt,
  };

  // Create detail
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
    type: memoryType,
    expiresAt: finalExpiresAt,
  };

  // Save both
  index.memories.push(entry);
  await saveMemoryIndex(redis, username, index);
  await saveMemoryDetail(redis, username, detail);

  return {
    success: true,
    message: `Memory "${normalizedKey}" created successfully (${memoryType}).`,
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
  type?: MemoryType,
  expiresAt?: number
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
  const existingEntry = index.memories[existingIdx];
  
  // Use provided type or keep existing type
  const memoryType = type ?? existingEntry.type;
  
  // Calculate expiration
  let finalExpiresAt: number | undefined;
  if (memoryType === "shortterm") {
    // For shortterm: use provided, or keep existing, or calculate new
    finalExpiresAt = expiresAt ?? existingEntry.expiresAt ?? calculateExpiresAt();
  } else {
    // Longterm memories don't expire
    finalExpiresAt = undefined;
  }

  // Update entry
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
    type: memoryType,
    expiresAt: finalExpiresAt,
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
    type: memoryType,
    expiresAt: finalExpiresAt,
  };

  // Save both
  index.memories[existingIdx] = entry;
  await saveMemoryIndex(redis, username, index);
  await saveMemoryDetail(redis, username, detail);

  return {
    success: true,
    message: `Memory "${normalizedKey}" updated successfully (${memoryType}).`,
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
  type?: MemoryType,
  expiresAt?: number
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
    return addMemory(redis, username, memoryKey, summary, content, type, expiresAt);
  }

  // Key exists - merge content
  const existingEntry = index.memories[existingIdx];
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
  
  // Use provided type or keep existing type
  const memoryType = type ?? existingEntry.type;
  
  // Calculate expiration
  let finalExpiresAt: number | undefined;
  if (memoryType === "shortterm") {
    finalExpiresAt = expiresAt ?? existingEntry.expiresAt ?? calculateExpiresAt();
  } else {
    finalExpiresAt = undefined;
  }

  // Update entry with new summary
  const entry: MemoryEntry = {
    key: normalizedKey,
    summary: summary.trim(),
    updatedAt: now,
    type: memoryType,
    expiresAt: finalExpiresAt,
  };

  // Update detail with merged content
  const detail: MemoryDetail = {
    key: normalizedKey,
    content: mergedContent,
    createdAt: existingDetail?.createdAt || now,
    updatedAt: now,
    type: memoryType,
    expiresAt: finalExpiresAt,
  };

  // Save both
  index.memories[existingIdx] = entry;
  await saveMemoryIndex(redis, username, index);
  await saveMemoryDetail(redis, username, detail);

  return {
    success: true,
    message: `Memory "${normalizedKey}" merged successfully (${memoryType}).`,
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
  type?: MemoryType,
  expiresAt?: number
): Promise<MemoryOperationResult> {
  switch (mode) {
    case "add":
      return addMemory(redis, username, memoryKey, summary, content, type, expiresAt);
    case "update":
      return updateMemory(redis, username, memoryKey, summary, content, type, expiresAt);
    case "merge":
      return mergeMemory(redis, username, memoryKey, summary, content, type, expiresAt);
    default:
      return {
        success: false,
        message: `Invalid mode "${mode}". Use "add", "update", or "merge".`,
      };
  }
}

/**
 * Promote a shortterm memory to longterm.
 * Removes expiration and changes type.
 */
export async function promoteMemoryToLongterm(
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
  
  const existingEntry = index.memories[existingIdx];
  
  // Already longterm
  if (existingEntry.type === "longterm") {
    return {
      success: true,
      message: `Memory "${normalizedKey}" is already longterm.`,
      entry: existingEntry,
    };
  }
  
  const now = Date.now();
  
  // Update entry to longterm
  const entry: MemoryEntry = {
    ...existingEntry,
    type: "longterm",
    expiresAt: undefined,
    updatedAt: now,
  };
  
  // Update detail
  const existingDetail = await getMemoryDetail(redis, username, normalizedKey);
  if (existingDetail) {
    const detail: MemoryDetail = {
      ...existingDetail,
      type: "longterm",
      expiresAt: undefined,
      updatedAt: now,
    };
    await saveMemoryDetail(redis, username, detail);
  }
  
  // Save index
  index.memories[existingIdx] = entry;
  await saveMemoryIndex(redis, username, index);
  
  return {
    success: true,
    message: `Memory "${normalizedKey}" promoted to longterm.`,
    entry,
  };
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
 * Get only active (non-expired) memories for a user.
 * This is the primary function for AI prompts - excludes expired shortterm memories.
 */
export async function getActiveMemoryIndex(
  redis: Redis,
  username: string
): Promise<MemoryIndex | null> {
  const index = await getMemoryIndex(redis, username);
  if (!index) {
    return null;
  }

  const { active } = filterActiveMemories(index.memories);
  
  return {
    memories: active,
    version: index.version,
  };
}

/**
 * Get memory summaries for system prompt injection
 * Returns a formatted string for inclusion in AI context
 * Only includes active (non-expired) memories.
 */
export async function getMemorySummariesForPrompt(
  redis: Redis,
  username: string
): Promise<string | null> {
  const index = await getActiveMemoryIndex(redis, username);
  if (!index || index.memories.length === 0) {
    return null;
  }

  const lines = index.memories.map((m) => {
    // Add [temp] indicator for shortterm memories
    const typeIndicator = m.type === "shortterm" ? " [temp]" : "";
    return `- ${m.key}${typeIndicator}: ${m.summary}`;
  });
  return lines.join("\n");
}
