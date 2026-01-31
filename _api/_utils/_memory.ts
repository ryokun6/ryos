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
export const MEMORY_SCHEMA_VERSION = 1;

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
