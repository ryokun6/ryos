/**
 * Settings and synced app-state tool schemas (calendar, contacts, stickies)
 */

import { z } from "zod";
import {
  THEME_IDS,
  LANGUAGE_CODES,
  CALENDAR_ACTIONS,
  CALENDAR_COLORS,
  CONTACT_ACTIONS,
} from "../types.js";
import { normalizeOptionalString } from "./media.js";

/**
 * Settings schema
 */
export const settingsSchema = z.object({
  language: z
    .enum(LANGUAGE_CODES)
    .optional()
    .describe(
      "Change the system language. Supported: 'en' (English), 'zh-TW' (Traditional Chinese), 'ja' (Japanese), 'ko' (Korean), 'fr' (French), 'de' (German), 'es' (Spanish), 'pt' (Portuguese), 'it' (Italian), 'ru' (Russian)."
    ),
  theme: z
    .enum(THEME_IDS)
    .optional()
    .describe(
      'Change the OS theme. One of "system7" (Mac OS 7), "macosx" (Mac OS X), "xp" (Windows XP), "win98" (Windows 98).'
    ),
  masterVolume: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      "Set the master volume (0-1). Affects all system sounds including UI sounds, speech, and music. Use 0 to mute."
    ),
  speechEnabled: z
    .boolean()
    .optional()
    .describe(
      "Enable or disable text-to-speech for AI responses. When enabled, the AI's responses will be read aloud."
    ),
  checkForUpdates: z
    .boolean()
    .optional()
    .describe(
      "When true, triggers a check for ryOS updates. Will notify the user if an update is available."
    ),
});

/**
 * Stickies control schema
 */
export const stickiesControlSchema = z
  .object({
    action: z
      .enum(["list", "create", "update", "delete", "clear"])
      .describe(
        "Action to perform: 'list' returns all stickies, 'create' creates a new sticky, 'update' modifies an existing sticky, 'delete' removes a sticky by ID, 'clear' removes all stickies."
      ),
    id: z
      .string()
      .optional()
      .describe(
        "For 'update' and 'delete' actions: the ID of the sticky to modify or remove."
      ),
    content: z
      .string()
      .optional()
      .describe(
        "For 'create' and 'update' actions: the text content to set or replace on the sticky note. Use this to write messages, notes, or any text."
      ),
    color: z
      .enum(["yellow", "blue", "green", "pink", "purple", "orange"])
      .optional()
      .describe(
        "For 'create' and 'update' actions: the color of the sticky note. Defaults to 'yellow' for new stickies."
      ),
    position: z
      .object({
        x: z.number().describe("X coordinate (pixels from left)"),
        y: z.number().describe("Y coordinate (pixels from top)"),
      })
      .optional()
      .describe(
        "For 'create' and 'update' actions: the position of the sticky note on screen."
      ),
    size: z
      .object({
        width: z.number().min(100).max(800).describe("Width in pixels (100-800)"),
        height: z.number().min(100).max(800).describe("Height in pixels (100-800)"),
      })
      .optional()
      .describe(
        "For 'create' and 'update' actions: the size of the sticky note."
      ),
  })
  .superRefine((data, ctx) => {
    if ((data.action === "update" || data.action === "delete") && !data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'id' parameter.`,
        path: ["id"],
      });
    }
  });

/**
 * Calendar control schema
 */
export const calendarControlSchema = z
  .object({
    action: z
      .enum(CALENDAR_ACTIONS)
      .describe(
        "Action to perform: 'list' returns events (optionally filtered by date), " +
          "'create' adds a new event, 'update' modifies an existing event by ID, " +
          "'delete' removes an event by ID. " +
          "Todo actions: 'listTodos' returns all todos (optionally filter by completed status), " +
          "'createTodo' adds a new todo, 'toggleTodo' toggles completion by ID, " +
          "'deleteTodo' removes a todo by ID."
      ),
    id: z
      .string()
      .optional()
      .describe("For 'update', 'delete', 'toggleTodo', and 'deleteTodo' actions: the item ID."),
    title: z
      .string()
      .max(200)
      .optional()
      .describe("For 'create', 'update', and 'createTodo': the title."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Date must be YYYY-MM-DD format" })
      .optional()
      .describe(
        "For events: event date (YYYY-MM-DD). For 'createTodo': optional due date. For 'list': filter events by date. For 'listTodos': filter by due date — OMIT to return ALL todos (most todos have no due date)."
      ),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, { message: "Time must be HH:MM format" })
      .optional()
      .describe("For 'create' and 'update': start time (HH:MM). Omit for all-day events."),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, { message: "Time must be HH:MM format" })
      .optional()
      .describe("For 'create' and 'update': end time (HH:MM). Omit for all-day events."),
    color: z
      .enum(CALENDAR_COLORS)
      .optional()
      .describe("Event color: 'blue', 'red', 'green', 'orange', or 'purple'. Defaults to 'blue'."),
    notes: z
      .string()
      .max(500)
      .optional()
      .describe("Optional notes for the event."),
    completed: z
      .boolean()
      .optional()
      .describe(
        "For 'listTodos': filter by completion status (true = completed, false = pending, omit = all)."
      ),
    calendarId: z
      .string()
      .optional()
      .describe(
        "For 'createTodo': which calendar to assign the todo to (e.g. 'home', 'work'). Defaults to the first calendar."
      ),
  })
  .superRefine((data, ctx) => {
    if (data.action === "create" && !data.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'create' action requires the 'title' parameter.",
        path: ["title"],
      });
    }
    if (data.action === "create" && !data.date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'create' action requires the 'date' parameter (YYYY-MM-DD).",
        path: ["date"],
      });
    }
    if ((data.action === "update" || data.action === "delete") && !data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'id' parameter.`,
        path: ["id"],
      });
    }
    if (data.action === "createTodo" && !data.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'createTodo' action requires the 'title' parameter.",
        path: ["title"],
      });
    }
    if ((data.action === "toggleTodo" || data.action === "deleteTodo") && !data.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'id' parameter.`,
        path: ["id"],
      });
    }
  });

/**
 * Contacts control schema
 */
export const contactsControlSchema = z
  .object({
    action: z
      .enum(CONTACT_ACTIONS)
      .describe(
        "Action to perform: 'list' searches/list contacts, 'get' returns one contact by id, 'create' adds a contact, 'update' modifies a contact by id, and 'delete' removes a contact by id."
      ),
    id: z
      .preprocess(normalizeOptionalString, z.string().optional())
      .describe("For 'get', 'update', and 'delete': the contact id returned by 'list'."),
    query: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe(
        "For 'list': optional search query across names, phones, emails, notes, and telegram fields."
      ),
    displayName: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("Primary display name for the contact."),
    firstName: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("First name."),
    lastName: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Last name."),
    nickname: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Nickname."),
    organization: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("Organization or company."),
    title: z
      .preprocess(normalizeOptionalString, z.string().max(200).optional())
      .describe("Job title."),
    notes: z
      .preprocess(normalizeOptionalString, z.string().max(2000).optional())
      .describe("Free-form notes."),
    emails: z.array(z.string().max(320)).max(20).optional().describe("Email addresses."),
    phones: z.array(z.string().max(80)).max(20).optional().describe("Phone numbers."),
    urls: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe("URLs such as websites or social profiles."),
    addresses: z
      .array(z.string().max(500))
      .max(20)
      .optional()
      .describe("Postal addresses as formatted strings."),
    birthday: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, {
        message: "Birthday must be YYYY-MM-DD format",
      })
      .nullable()
      .optional()
      .describe("Birthday in YYYY-MM-DD format."),
    telegramUsername: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Telegram username without the @ prefix."),
    telegramUserId: z
      .preprocess(normalizeOptionalString, z.string().max(120).optional())
      .describe("Telegram user id as a string."),
  })
  .superRefine((data, ctx) => {
    if (
      (data.action === "get" || data.action === "update" || data.action === "delete") &&
      !data.id
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'id' parameter.`,
        path: ["id"],
      });
    }

    if (data.action === "update") {
      const hasUpdates = Boolean(
        data.displayName ||
          data.firstName ||
          data.lastName ||
          data.nickname ||
          data.organization ||
          data.title ||
          data.notes ||
          data.telegramUsername ||
          data.telegramUserId ||
          data.birthday ||
          data.emails?.length ||
          data.phones?.length ||
          data.urls?.length ||
          data.addresses?.length
      );

      if (!hasUpdates) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The 'update' action requires at least one field to change.",
          path: ["action"],
        });
      }
    }

    if (data.action === "create") {
      const hasIdentity = Boolean(
        data.displayName ||
          data.firstName ||
          data.lastName ||
          data.organization ||
          data.telegramUsername ||
          data.telegramUserId ||
          data.emails?.length ||
          data.phones?.length
      );

      if (!hasIdentity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "The 'create' action requires at least a name, organization, email, phone, or telegram field.",
          path: ["action"],
        });
      }
    }
  });
