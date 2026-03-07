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
  CalendarControlInput,
  CalendarControlOutput,
  StickiesControlInput,
  StickiesControlOutput,
  CalendarSnapshotData,
  StickiesSnapshotData,
} from "./types.js";
import { stateKey } from "../../sync/state.js";
import {
  getMemoryIndex,
  getMemoryDetail,
  upsertMemory,
  deleteMemory,
  appendDailyNote,
  getDailyNote,
  getTodayDateString,
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

      // Add timeout to prevent hanging on network stalls
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(searchUrl.toString(), { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

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

      const data = await response.json() as { items?: Array<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; publishedAt: string; thumbnails: { medium?: { url: string } } };
      }> };

      if (!data.items || data.items.length === 0) {
        return {
          results: [],
          message: `No songs found for "${query}"`,
        };
      }

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
        message: `Found ${results.length} ${results.length === 1 ? "song" : "songs"} for "${query}"`,
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
// Unified Memory Tool Executors
// ============================================================================

/**
 * Extended context for memory operations
 */
export interface MemoryToolContext extends ServerToolContext {
  username?: string | null;
  redis?: Redis;
  timeZone?: string;
}

/**
 * Execute memoryWrite tool (unified)
 * 
 * Handles both long-term memory writes and daily note appends.
 */
export async function executeMemoryWrite(
  input: MemoryWriteInput,
  context: MemoryToolContext
): Promise<MemoryWriteOutput> {
  const { type = "long_term", content } = input;

  // Validate authentication
  if (!context.username) {
    context.log("[memoryWrite] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to write memories. Please log in.",
    };
  }

  if (!context.redis) {
    context.logError("[memoryWrite] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
    };
  }

  try {
    // Route to the appropriate handler
    if (type === "daily") {
      context.log(`[memoryWrite:daily] Logging daily note (${content.length} chars)`);
      const result = await appendDailyNote(
        context.redis,
        context.username,
        content,
        { timeZone: context.timeZone },
      );

      context.log(
        `[memoryWrite:daily] Result: ${result.success ? "success" : "failed"} - ${result.message}`
      );

      return {
        success: result.success,
        message: result.message,
        date: result.date,
        entryCount: result.entryCount,
      };
    }

    // Long-term memory write
    const { key, summary, mode = "add" } = input;

    if (!key || !summary) {
      return {
        success: false,
        message: "Key and summary are required for long-term memories.",
      };
    }

    context.log(`[memoryWrite:long_term] Writing "${key}" with mode "${mode}"`);

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
      `[memoryWrite:long_term] Result: ${result.success ? "success" : "failed"} - ${result.message}`
    );

    return {
      success: result.success,
      message: result.message,
      currentMemories,
    };
  } catch (error) {
    context.logError("[memoryWrite] Unexpected error:", error);
    return {
      success: false,
      message: `Memory write failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Execute memoryRead tool (unified)
 * 
 * Reads either a long-term memory by key or daily notes by date.
 */
export async function executeMemoryRead(
  input: MemoryReadInput,
  context: MemoryToolContext
): Promise<MemoryReadOutput> {
  const { type = "long_term" } = input;

  // Validate authentication
  if (!context.username) {
    context.log("[memoryRead] No username - authentication required");
    return {
      success: false,
      message: "Authentication required to read memories. Please log in.",
    };
  }

  if (!context.redis) {
    context.logError("[memoryRead] Redis not available");
    return {
      success: false,
      message: "Memory storage not available.",
    };
  }

  try {
    // Route to the appropriate handler
    if (type === "daily") {
      const date = input.date || getTodayDateString(context.timeZone);
      context.log(`[memoryRead:daily] Reading daily note for ${date}`);

      const note = await getDailyNote(context.redis, context.username, date);

      if (!note || note.entries.length === 0) {
        return {
          success: false,
          message: `No daily notes found for ${date}.`,
          date,
          entries: [],
        };
      }

      context.log(`[memoryRead:daily] Found ${note.entries.length} entries for ${date}`);

      return {
        success: true,
        message: `Retrieved ${note.entries.length} entries for ${date}.`,
        date,
        entries: note.entries.map((e) => ({
          timestamp: e.timestamp,
          isoTimestamp: e.isoTimestamp,
          localDate: e.localDate,
          localTime: e.localTime,
          timeZone: e.timeZone,
          content: e.content,
        })),
      };
    }

    // Long-term memory read
    const { key } = input;

    if (!key) {
      return {
        success: false,
        message: "Key is required for reading long-term memories.",
      };
    }

    context.log(`[memoryRead:long_term] Reading memory "${key}"`);

    const detail = await getMemoryDetail(context.redis, context.username, key);

    if (!detail) {
      context.log(`[memoryRead:long_term] Memory "${key}" not found`);
      return {
        success: false,
        message: `Memory "${key}" not found.`,
        key,
        content: null,
        summary: null,
      };
    }

    const index = await getMemoryIndex(context.redis, context.username);
    const entry = index?.memories.find((m) => m.key === key.toLowerCase());

    context.log(`[memoryRead:long_term] Found memory "${key}" (${detail.content.length} chars)`);

    return {
      success: true,
      message: `Retrieved memory "${key}".`,
      key,
      content: detail.content,
      summary: entry?.summary || null,
    };
  } catch (error) {
    context.logError("[memoryRead] Unexpected error:", error);
    return {
      success: false,
      message: `Memory read failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Execute memoryDelete tool
 * 
 * Deletes a long-term memory by key.
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

  try {
    const result = await deleteMemory(context.redis, context.username, key);

    context.log(
      `[memoryDelete] Result: ${result.success ? "success" : "failed"} - ${result.message}`
    );

    return {
      success: result.success,
      message: result.message,
    };
  } catch (error) {
    context.logError("[memoryDelete] Unexpected error:", error);
    return {
      success: false,
      message: `Memory delete failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// ============================================================================
// Server-Side Calendar & Stickies Executors (Redis-backed)
// ============================================================================

interface AppStateToolContext extends MemoryToolContext {}

async function readCalendarState(
  redis: Redis,
  username: string
): Promise<CalendarSnapshotData | null> {
  const raw = await redis.get<string | { data: CalendarSnapshotData }>(
    stateKey(username, "calendar")
  );
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed?.data ?? null;
}

async function writeCalendarState(
  redis: Redis,
  username: string,
  data: CalendarSnapshotData
): Promise<void> {
  const now = new Date().toISOString();
  await redis.set(
    stateKey(username, "calendar"),
    JSON.stringify({ data, updatedAt: now, version: 1, createdAt: now })
  );
  const metaKey = `sync:state:meta:${username}`;
  const rawMeta = await redis.get<string | Record<string, unknown>>(metaKey);
  const meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta || {};
  meta.calendar = { updatedAt: now, version: 1, createdAt: now };
  await redis.set(metaKey, JSON.stringify(meta));
}

async function readStickiesState(
  redis: Redis,
  username: string
): Promise<StickiesSnapshotData | null> {
  const raw = await redis.get<string | { data: StickiesSnapshotData }>(
    stateKey(username, "stickies")
  );
  if (!raw) return null;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return parsed?.data ?? null;
}

async function writeStickiesState(
  redis: Redis,
  username: string,
  data: StickiesSnapshotData
): Promise<void> {
  const now = new Date().toISOString();
  await redis.set(
    stateKey(username, "stickies"),
    JSON.stringify({ data, updatedAt: now, version: 1, createdAt: now })
  );
  const metaKey = `sync:state:meta:${username}`;
  const rawMeta = await redis.get<string | Record<string, unknown>>(metaKey);
  const meta = typeof rawMeta === "string" ? JSON.parse(rawMeta) : rawMeta || {};
  meta.stickies = { updatedAt: now, version: 1, createdAt: now };
  await redis.set(metaKey, JSON.stringify(meta));
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function executeCalendarControl(
  input: CalendarControlInput,
  context: AppStateToolContext
): Promise<CalendarControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const { action } = input;

  const state = await readCalendarState(context.redis, context.username);
  if (!state) {
    return {
      success: false,
      message: "No calendar data synced yet. Enable cloud sync in ryOS first.",
    };
  }

  switch (action) {
    case "list": {
      let events = state.events;
      if (input.date) {
        events = events.filter((ev) => ev.date === input.date);
      }
      const formatted = events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        color: ev.color,
        notes: ev.notes,
      }));
      return {
        success: true,
        message: input.date
          ? `Found ${formatted.length} ${formatted.length === 1 ? "event" : "events"} for ${input.date}.`
          : `Found ${formatted.length} ${formatted.length === 1 ? "event" : "events"} total.`,
        events: formatted,
      };
    }

    case "create": {
      if (!input.title || !input.date) {
        return { success: false, message: "Creating an event requires 'title' and 'date'." };
      }
      const now = Date.now();
      const newEvent = {
        id: generateId(),
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        color: input.color || "blue",
        calendarId: input.calendarId,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      state.events.push(newEvent);
      await writeCalendarState(context.redis, context.username, state);
      context.log(`[calendarControl] Created event "${input.title}" on ${input.date}`);
      return {
        success: true,
        message: `Created event "${input.title}" on ${input.date}.`,
        event: {
          id: newEvent.id,
          title: newEvent.title,
          date: newEvent.date,
          startTime: newEvent.startTime,
          endTime: newEvent.endTime,
          color: newEvent.color,
          notes: newEvent.notes,
        },
      };
    }

    case "update": {
      if (!input.id) {
        return { success: false, message: "Updating an event requires 'id'." };
      }
      const idx = state.events.findIndex((ev) => ev.id === input.id);
      if (idx === -1) {
        return { success: false, message: `Event with id '${input.id}' not found.` };
      }
      const ev = state.events[idx];
      if (input.title !== undefined) ev.title = input.title;
      if (input.date !== undefined) ev.date = input.date;
      if (input.startTime !== undefined) ev.startTime = input.startTime;
      if (input.endTime !== undefined) ev.endTime = input.endTime;
      if (input.color !== undefined) ev.color = input.color;
      if (input.notes !== undefined) ev.notes = input.notes;
      ev.updatedAt = Date.now();
      await writeCalendarState(context.redis, context.username, state);
      return { success: true, message: `Updated event "${ev.title}".` };
    }

    case "delete": {
      if (!input.id) {
        return { success: false, message: "Deleting an event requires 'id'." };
      }
      const delIdx = state.events.findIndex((ev) => ev.id === input.id);
      if (delIdx === -1) {
        return { success: false, message: `Event with id '${input.id}' not found.` };
      }
      const deleted = state.events.splice(delIdx, 1)[0];
      await writeCalendarState(context.redis, context.username, state);
      return { success: true, message: `Deleted event "${deleted.title}".` };
    }

    case "listTodos": {
      let todos = state.todos;
      if (input.completed === true) {
        todos = todos.filter((t) => t.completed);
      }
      return {
        success: true,
        message: `Found ${todos.length} ${todos.length === 1 ? "todo" : "todos"}.`,
        todos: todos.map((t) => ({
          id: t.id,
          title: t.title,
          completed: t.completed,
          dueDate: t.dueDate,
          calendarId: t.calendarId,
        })),
      };
    }

    case "createTodo": {
      if (!input.title) {
        return { success: false, message: "Creating a todo requires 'title'." };
      }
      const calendarId = input.calendarId || state.calendars[0]?.id || "home";
      const newTodo = {
        id: generateId(),
        title: input.title,
        completed: false,
        dueDate: input.date || null,
        calendarId,
        createdAt: Date.now(),
      };
      state.todos.push(newTodo);
      await writeCalendarState(context.redis, context.username, state);
      context.log(`[calendarControl] Created todo "${input.title}"`);
      return {
        success: true,
        message: `Created todo "${input.title}"${input.date ? ` due ${input.date}` : ""}.`,
        todo: {
          id: newTodo.id,
          title: newTodo.title,
          completed: false,
          dueDate: newTodo.dueDate,
          calendarId,
        },
      };
    }

    case "toggleTodo": {
      if (!input.id) {
        return { success: false, message: "Toggling a todo requires 'id'." };
      }
      const todo = state.todos.find((t) => t.id === input.id);
      if (!todo) {
        return { success: false, message: `Todo with id '${input.id}' not found.` };
      }
      todo.completed = !todo.completed;
      await writeCalendarState(context.redis, context.username, state);
      return {
        success: true,
        message: `Marked todo "${todo.title}" as ${todo.completed ? "completed" : "pending"}.`,
        todo: {
          id: todo.id,
          title: todo.title,
          completed: todo.completed,
          dueDate: todo.dueDate,
          calendarId: todo.calendarId,
        },
      };
    }

    case "deleteTodo": {
      if (!input.id) {
        return { success: false, message: "Deleting a todo requires 'id'." };
      }
      const todoIdx = state.todos.findIndex((t) => t.id === input.id);
      if (todoIdx === -1) {
        return { success: false, message: `Todo with id '${input.id}' not found.` };
      }
      const deletedTodo = state.todos.splice(todoIdx, 1)[0];
      await writeCalendarState(context.redis, context.username, state);
      return { success: true, message: `Deleted todo "${deletedTodo.title}".` };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

export async function executeStickiesControl(
  input: StickiesControlInput,
  context: AppStateToolContext
): Promise<StickiesControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const { action } = input;

  const state = await readStickiesState(context.redis, context.username);
  if (!state && action !== "create") {
    return {
      success: false,
      message: "No stickies data synced yet. Enable cloud sync in ryOS first.",
    };
  }

  const notes = state?.notes ?? [];

  switch (action) {
    case "list": {
      if (notes.length === 0) {
        return { success: true, message: "No stickies found." };
      }
      return {
        success: true,
        message: `Found ${notes.length} ${notes.length === 1 ? "sticky note" : "sticky notes"}.`,
        notes: notes.map((n) => ({
          id: n.id,
          content: n.content,
          color: n.color as any,
          position: n.position,
          size: n.size,
        })),
      };
    }

    case "create": {
      const now = Date.now();
      const newNote = {
        id: generateId(),
        content: input.content || "",
        color: input.color || "yellow",
        position: input.position || { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
        size: input.size || { width: 200, height: 200 },
        createdAt: now,
        updatedAt: now,
      };
      const updatedNotes = [...notes, newNote];
      await writeStickiesState(context.redis, context.username!, { notes: updatedNotes });
      context.log(`[stickiesControl] Created sticky note (${input.color || "yellow"})`);
      return {
        success: true,
        message: `Created ${input.color || "yellow"} sticky note.`,
        note: {
          id: newNote.id,
          content: newNote.content,
          color: newNote.color as any,
          position: newNote.position,
          size: newNote.size,
        },
      };
    }

    case "update": {
      if (!input.id) {
        return { success: false, message: "Updating a sticky requires 'id'." };
      }
      const noteIdx = notes.findIndex((n) => n.id === input.id);
      if (noteIdx === -1) {
        return { success: false, message: `Sticky with id '${input.id}' not found.` };
      }
      const note = { ...notes[noteIdx] };
      if (input.content !== undefined) note.content = input.content;
      if (input.color !== undefined) note.color = input.color;
      if (input.position !== undefined) note.position = input.position;
      if (input.size !== undefined) note.size = input.size;
      note.updatedAt = Date.now();
      const updatedList = [...notes];
      updatedList[noteIdx] = note;
      await writeStickiesState(context.redis, context.username!, { notes: updatedList });
      return { success: true, message: "Updated sticky note." };
    }

    case "delete": {
      if (!input.id) {
        return { success: false, message: "Deleting a sticky requires 'id'." };
      }
      const delIdx = notes.findIndex((n) => n.id === input.id);
      if (delIdx === -1) {
        return { success: false, message: `Sticky with id '${input.id}' not found.` };
      }
      const filtered = notes.filter((n) => n.id !== input.id);
      await writeStickiesState(context.redis, context.username!, { notes: filtered });
      return { success: true, message: "Deleted sticky note." };
    }

    case "clear": {
      if (notes.length === 0) {
        return { success: true, message: "No stickies to clear." };
      }
      const count = notes.length;
      await writeStickiesState(context.redis, context.username!, { notes: [] });
      return { success: true, message: `Cleared ${count} ${count === 1 ? "sticky note" : "sticky notes"}.` };
    }

    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}
