/**
 * Server-side tool executors
 * 
 * This module contains the server-side execution logic for tools that can
 * run entirely on the server (no browser state needed).
 * 
 * Tools that require client-side state (like launching apps, controlling media)
 * do not have executors here - they are handled by the client via onToolCall.
 */

import type { Redis } from "@upstash/redis";
import type {
  ServerToolContext,
  GenerateHtmlInput,
  GenerateHtmlOutput,
  SearchSongsInput,
  SearchSongsOutput,
  SearchSongsResult,
  MemoryWriteInput,
  MemoryWriteOutput,
  MemoryReadInput,
  MemoryReadOutput,
  MemoryDeleteInput,
  MemoryDeleteOutput,
} from "./types.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
} from "../../_utils/_memory.js";

/**
 * Execute generateHtml tool
 * 
 * Server-side validation and passthrough of HTML content.
 * The actual rendering happens on the client.
 */
export async function executeGenerateHtml(
  input: GenerateHtmlInput,
  context: ServerToolContext
): Promise<GenerateHtmlOutput> {
  const { html, title, icon } = input;
  
  context.log(
    `[generateHtml] Received HTML (${html.length} chars), title: ${title || "none"}, icon: ${icon || "none"}`
  );

  if (!html || html.trim().length === 0) {
    throw new Error("HTML content cannot be empty");
  }

  return {
    html,
    title: title || "Applet",
    icon: icon || "📦",
  };
}

/**
 * Execute searchSongs tool
 * 
 * Search YouTube for songs with API key rotation for quota management.
 */
export async function executeSearchSongs(
  input: SearchSongsInput,
  context: ServerToolContext
): Promise<SearchSongsOutput> {
  const { query, maxResults = 5 } = input;
  
  context.log(`[searchSongs] Searching for: "${query}" (max ${maxResults} results)`);

  // Collect all available API keys for rotation
  const apiKeys = [
    context.env.YOUTUBE_API_KEY,
    context.env.YOUTUBE_API_KEY_2,
  ].filter((key): key is string => !!key);

  if (apiKeys.length === 0) {
    throw new Error("No YouTube API keys configured");
  }

  context.log(`[searchSongs] Available API keys: ${apiKeys.length}`);

  // Helper to check if error is a quota exceeded error
  const isQuotaError = (status: number, errorText: string): boolean => {
    if (status === 403) {
      const lowerText = errorText.toLowerCase();
      return lowerText.includes("quota") || lowerText.includes("exceeded") || lowerText.includes("limit");
    }
    return false;
  };

  let lastError: string | null = null;

  // Try each API key until one works
  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    const keyLabel = keyIndex === 0 ? "primary" : `backup-${keyIndex}`;

    try {
      context.log(`[searchSongs] Trying ${keyLabel} API key (${keyIndex + 1}/${apiKeys.length})`);

      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.searchParams.set("part", "snippet");
      searchUrl.searchParams.set("type", "video");
      searchUrl.searchParams.set("videoCategoryId", "10"); // Music category
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("maxResults", String(maxResults));
      searchUrl.searchParams.set("key", apiKey);

      const response = await fetch(searchUrl.toString());

      if (!response.ok) {
        const errorText = await response.text();
        context.log(`[searchSongs] YouTube API error with ${keyLabel} key: ${response.status} - ${errorText}`);

        // Check if quota exceeded and we have more keys to try
        if (isQuotaError(response.status, errorText) && keyIndex < apiKeys.length - 1) {
          context.log(`[searchSongs] Quota exceeded for ${keyLabel} key, rotating to next key`);
          lastError = errorText;
          continue; // Try next key
        }

        throw new Error(`YouTube search failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return {
          results: [],
          message: `No songs found for "${query}"`,
        };
      }

      // Transform results to a simpler format
      const results: SearchSongsResult[] = data.items.map((item: {
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails?: { medium?: { url: string } };
        };
      }) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
      }));

      context.log(`[searchSongs] Found ${results.length} results for "${query}" using ${keyLabel} key`);

      return {
        results,
        message: `Found ${results.length} song(s) for "${query}"`,
        hint: "Use ipodControl with action 'addAndPlay' and the videoId to add a song to the iPod",
      };
    } catch (error) {
      context.logError(`[searchSongs] Error with ${keyLabel} key:`, error);
      // If we have more keys, try the next one
      if (keyIndex < apiKeys.length - 1) {
        context.log(`[searchSongs] Retrying with next API key`);
        continue;
      }
      throw new Error(`Failed to search for songs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // All keys exhausted
  throw new Error(`All YouTube API keys exhausted. Last error: ${lastError || 'Unknown'}`);
}

// ============================================================================
// Memory Tool Executors
// ============================================================================

/**
 * Extended context for memory operations
 */
export interface MemoryToolContext extends ServerToolContext {
  username?: string | null;
  redis?: Redis;
}

/**
 * Execute memoryWrite tool
 * 
 * Saves or updates a memory for the authenticated user.
 * Returns the current memories list so the AI knows what's stored.
 */
export async function executeMemoryWrite(
  input: MemoryWriteInput,
  context: MemoryToolContext
): Promise<MemoryWriteOutput> {
  const { key, summary, content, mode = "add" } = input;

  context.log(`[memoryWrite] Writing memory "${key}" with mode "${mode}"`);

  // Validate authentication
  if (!context.username) {
    context.log("[memoryWrite] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to write memories. Please log in.",
      currentMemories: [],
    };
  }

  if (!context.redis) {
    context.logError("[memoryWrite] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
      currentMemories: [],
    };
  }

  // Execute the memory operation
  const result = await upsertMemory(
    context.redis,
    context.username,
    key,
    summary,
    content,
    mode
  );

  // Get updated memory list
  const index = await getMemoryIndex(context.redis, context.username);
  const currentMemories = index?.memories.map((m) => ({
    key: m.key,
    summary: m.summary,
  })) || [];

  context.log(
    `[memoryWrite] Result: ${result.success ? "success" : "failed"} - ${result.message}`
  );

  return {
    success: result.success,
    message: result.message,
    currentMemories,
  };
}

/**
 * Execute memoryRead tool
 * 
 * Retrieves the full content of a memory by key.
 */
export async function executeMemoryRead(
  input: MemoryReadInput,
  context: MemoryToolContext
): Promise<MemoryReadOutput> {
  const { key } = input;

  context.log(`[memoryRead] Reading memory "${key}"`);

  // Validate authentication
  if (!context.username) {
    context.log("[memoryRead] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to read memories. Please log in.",
      key,
      content: null,
      summary: null,
    };
  }

  if (!context.redis) {
    context.logError("[memoryRead] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
      key,
      content: null,
      summary: null,
    };
  }

  // Get the memory detail
  const detail = await getMemoryDetail(context.redis, context.username, key);

  if (!detail) {
    context.log(`[memoryRead] Memory "${key}" not found`);
    return {
      success: false,
      message: `Memory "${key}" not found.`,
      key,
      content: null,
      summary: null,
    };
  }

  // Also get the summary from the index
  const index = await getMemoryIndex(context.redis, context.username);
  const entry = index?.memories.find((m) => m.key === key.toLowerCase());

  context.log(`[memoryRead] Found memory "${key}" (${detail.content.length} chars)`);

  return {
    success: true,
    message: `Retrieved memory "${key}".`,
    key,
    content: detail.content,
    summary: entry?.summary || null,
  };
}

/**
 * Execute memoryDelete tool
 * 
 * Deletes a memory by key.
 */
export async function executeMemoryDelete(
  input: MemoryDeleteInput,
  context: MemoryToolContext
): Promise<MemoryDeleteOutput> {
  const { key } = input;

  context.log(`[memoryDelete] Deleting memory "${key}"`);

  // Validate authentication
  if (!context.username) {
    context.log("[memoryDelete] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to delete memories. Please log in.",
    };
  }

  if (!context.redis) {
    context.logError("[memoryDelete] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
    };
  }

  // Execute the delete operation
  const result = await deleteMemory(context.redis, context.username, key);

  context.log(
    `[memoryDelete] Result: ${result.success ? "success" : "failed"} - ${result.message}`
  );

  return {
    success: result.success,
    message: result.message,
  };
}
