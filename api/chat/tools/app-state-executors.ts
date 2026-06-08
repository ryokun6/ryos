import type { Redis } from "../../_utils/redis.js";
import { stateKey, writeRedisSyncDomainFromServerTool } from "../../sync/_state.js";
import type {
  AppStateToolContext,
  CalendarControlInput,
  CalendarControlOutput,
  CalendarSnapshotData,
  ContactsControlInput,
  ContactsControlOutput,
  ContactsSnapshotData,
  StickiesControlInput,
  StickiesControlOutput,
  StickiesSnapshotData,
} from "./types.js";
import {
  applyContactsToolAction,
  serializeContactToolRecord,
} from "../../../src/shared/tools/contacts.js";
import { applyCalendarToolAction } from "../../../src/shared/tools/calendar.js";
import {
  applyStickiesToolAction,
  serializeStickyToolRecord,
} from "../../../src/shared/tools/stickies.js";
import {
  readContactsState,
  writeContactsState,
} from "../../_utils/contacts.js";

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
  await writeRedisSyncDomainFromServerTool(redis, username, "calendar", data);
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
  await writeRedisSyncDomainFromServerTool(redis, username, "stickies", data);
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

  const result = applyCalendarToolAction(state, input, {
    generateId,
    now: () => Date.now(),
    deletedAt: () => new Date().toISOString(),
  });

  if (!result.ok) {
    if (result.error === "missing_fields") {
      if (action === "create") {
        return { success: false, message: "Creating an event requires 'title' and 'date'." };
      }
      if (action === "createTodo") {
        return { success: false, message: "Creating a todo requires 'title'." };
      }
    }
    if (result.error === "missing_id") {
      const messages: Partial<Record<CalendarControlInput["action"], string>> = {
        update: "Updating an event requires 'id'.",
        delete: "Deleting an event requires 'id'.",
        toggleTodo: "Toggling a todo requires 'id'.",
        deleteTodo: "Deleting a todo requires 'id'.",
      };
      return { success: false, message: messages[action] || "Calendar item id is required." };
    }
    if (result.error === "not_found") {
      const type = action === "toggleTodo" || action === "deleteTodo" ? "Todo" : "Event";
      return { success: false, message: `${type} with id '${result.id}' not found.` };
    }
    return { success: false, message: `Unknown action: ${action}` };
  }

  switch (result.kind) {
    case "list": {
      const formatted = result.events;
      return {
        success: true,
        message: input.date
          ? `Found ${formatted.length} ${formatted.length === 1 ? "event" : "events"} for ${input.date}.`
          : `Found ${formatted.length} ${formatted.length === 1 ? "event" : "events"} total.`,
        events: formatted,
      };
    }

    case "create": {
      await writeCalendarState(context.redis, context.username, result.state);
      context.log(`[calendarControl] Created event "${input.title}" on ${input.date}`);
      return {
        success: true,
        message: `Created event "${input.title}" on ${input.date}.`,
        event: result.event,
      };
    }

    case "update": {
      await writeCalendarState(context.redis, context.username, result.state);
      return { success: true, message: `Updated event "${result.event.title}".` };
    }

    case "delete": {
      await writeCalendarState(context.redis, context.username, result.state);
      return { success: true, message: `Deleted event "${result.event.title}".` };
    }

    case "listTodos":
      return {
        success: true,
        message: `Found ${result.todos.length} ${result.todos.length === 1 ? "todo" : "todos"}.`,
        todos: result.todos,
      };

    case "createTodo": {
      await writeCalendarState(context.redis, context.username, result.state);
      context.log(`[calendarControl] Created todo "${input.title}"`);
      return {
        success: true,
        message: `Created todo "${input.title}"${input.date ? ` due ${input.date}` : ""}.`,
        todo: result.todo,
      };
    }

    case "toggleTodo": {
      await writeCalendarState(context.redis, context.username, result.state);
      return {
        success: true,
        message: `Marked todo "${result.todo.title}" as ${result.todo.completed ? "completed" : "pending"}.`,
        todo: result.todo,
      };
    }

    case "deleteTodo": {
      await writeCalendarState(context.redis, context.username, result.state);
      return { success: true, message: `Deleted todo "${result.todo.title}".` };
    }
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

  const result = applyStickiesToolAction(
    state || { notes: [], deletedNoteIds: {} },
    input,
    {
      resolvedId: input.id,
      generateId,
      now: () => Date.now(),
      deletedAt: () => new Date().toISOString(),
      defaultPosition: () => ({
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      }),
      defaultSize: () => ({ width: 200, height: 200 }),
    }
  );

  if (!result.ok) {
    if (result.error === "missing_id") {
      return {
        success: false,
        message:
          action === "delete"
            ? "Deleting a sticky requires 'id'."
            : "Updating a sticky requires 'id'.",
      };
    }
    if (result.error === "not_found") {
      return { success: false, message: `Sticky with id '${result.id}' not found.` };
    }
    if (result.error === "no_updates") {
      return { success: false, message: "No sticky updates provided." };
    }
    return { success: false, message: `Unknown action: ${action}` };
  }

  switch (result.kind) {
    case "list": {
      if (result.notes.length === 0) {
        return { success: true, message: "No stickies found." };
      }
      return {
        success: true,
        message: `Found ${result.notes.length} ${result.notes.length === 1 ? "sticky note" : "sticky notes"}.`,
        notes: result.notes.map((note) => serializeStickyToolRecord(note)),
      };
    }

    case "create": {
      await writeStickiesState(context.redis, context.username!, result.state);
      context.log(`[stickiesControl] Created sticky note (${input.color || "yellow"})`);
      return {
        success: true,
        message: `Created ${input.color || "yellow"} sticky note.`,
        note: serializeStickyToolRecord(result.note),
      };
    }

    case "update": {
      await writeStickiesState(context.redis, context.username!, result.state);
      return { success: true, message: "Updated sticky note." };
    }

    case "delete": {
      await writeStickiesState(context.redis, context.username!, result.state);
      return { success: true, message: "Deleted sticky note." };
    }

    case "clear": {
      if (result.count === 0) {
        return { success: true, message: "No stickies to clear." };
      }
      await writeStickiesState(context.redis, context.username!, result.state);
      return { success: true, message: `Cleared ${result.count} ${result.count === 1 ? "sticky note" : "sticky notes"}.` };
    }
  }
}

export async function executeContactsControl(
  input: ContactsControlInput,
  context: AppStateToolContext
): Promise<ContactsControlOutput> {
  if (!context.username) {
    return { success: false, message: "Authentication required." };
  }
  if (!context.redis) {
    return { success: false, message: "Storage not available." };
  }

  const state: ContactsSnapshotData = await readContactsState(
    context.redis,
    context.username
  );

  const result = applyContactsToolAction(state, input, {
    resolvedId: input.id,
    deletedAt: new Date().toISOString(),
  });

  if (!result.ok) {
    switch (result.error) {
      case "missing_id":
        return { success: false, message: "Contact id is required." };
      case "not_found":
        return {
          success: false,
          message: `Contact with id '${result.id}' not found.`,
        };
      case "missing_data":
        return { success: false, message: "No contact data provided." };
      case "no_updates":
        return { success: false, message: "No contact updates provided." };
      default:
        return { success: false, message: `Unknown action: ${input.action}` };
    }
  }

  switch (result.kind) {
    case "list":
      return {
        success: true,
        message:
          result.contacts.length === 0
            ? "No contacts found."
            : `Found ${result.contacts.length} ${
                result.contacts.length === 1 ? "contact" : "contacts"
              }.`,
        contacts: result.contacts.map(serializeContactToolRecord),
      };

    case "get":
      return {
        success: true,
        message: `Loaded contact "${result.contact.displayName}".`,
        contact: serializeContactToolRecord(result.contact),
      };

    case "create": {
      await writeContactsState(context.redis, context.username, result.state);
      const serialized = serializeContactToolRecord(result.contact);
      context.log(
        `[contactsControl] Created contact "${result.contact.displayName}" (${serialized.summary || ""})`
      );
      return {
        success: true,
        message: `Created contact "${result.contact.displayName}".`,
        contact: serialized,
      };
    }

    case "update": {
      await writeContactsState(context.redis, context.username, result.state);

      return {
        success: true,
        message: `Updated contact "${result.contact.displayName}".`,
        contact: serializeContactToolRecord(result.contact),
      };
    }

    case "delete": {
      await writeContactsState(context.redis, context.username, result.state);

      return {
        success: true,
        message: `Deleted contact "${result.contact.displayName}".`,
      };
    }
  }
}
