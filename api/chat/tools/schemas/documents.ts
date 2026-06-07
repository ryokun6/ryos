/**
 * Documents control and VFS document tool schemas
 */

import { z } from "zod";
import { VFS_PATHS, DOCUMENTS_ACTIONS, DOCUMENT_WRITE_MODES } from "../types.js";

/**
 * List schema (VFS)
 */
export const listSchema = z.object({
  path: z
    .enum(VFS_PATHS)
    .describe(
      "The directory path to list: '/Applets' for local applets, '/Documents' for documents, '/Applications' for apps, '/Music' for songs in the iPod music libraries, '/Applets Store' for shared applets"
    ),
  librarySource: z
    .enum(["active", "youtube", "appleMusic"])
    .optional()
    .describe(
      "For '/Music' only: which iPod library to list. Defaults to 'active'. Use 'youtube' for Karaoke because Karaoke always plays YouTube-library tracks."
    ),
  query: z
    .string()
    .max(200)
    .optional()
    .describe(
      "Optional search query to filter results. For '/Music', searches id/title/artist/album in the selected iPod library. For '/Applets Store', searches title, name, or creator."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Optional maximum number of results to return (default 25 for '/Music', 50 for '/Applets Store')."
    ),
});

/**
 * Open schema (VFS)
 */
export const openSchema = z.object({
  path: z
    .string()
    .describe(
      "The EXACT path from list results. Examples:\n" +
        "- '/Applets/Calculator.app' - Open local applet\n" +
        "- '/Documents/notes.md' - Open document in TextEdit\n" +
        "- '/Applications/internet-explorer' - Launch app\n" +
        "- '/Music/{id}' - Play song by ID\n" +
        "- '/Applets Store/{id}' - Preview shared applet"
    ),
});

/**
 * Read schema (VFS)
 */
export const readSchema = z.object({
  path: z
    .string()
    .describe(
      "The file path to read. Must be from /Applets, /Documents, or /Applets Store. Use exact path from list results or store applet ID for shared applets."
    ),
});

/**
 * Write schema (VFS)
 */
export const writeSchema = z.object({
  path: z
    .string()
    .describe(
      "Full file path including .md extension. Example: '/Documents/my-notes.md' or '/Documents/Meeting Notes.md'"
    ),
  content: z.string().describe("The markdown content to write."),
  mode: z
    .enum(["overwrite", "append", "prepend"])
    .optional()
    .describe(
      "Write mode: 'overwrite' replaces content (default), 'append' adds to end, 'prepend' adds to start."
    ),
});

/**
 * Edit schema (VFS)
 */
export const editSchema = z.object({
  path: z
    .string()
    .describe("The file path to edit. Must be in /Documents or /Applets."),
  old_string: z
    .string()
    .describe(
      "The text to replace (must be unique within the file, and must match exactly including whitespace and indentation)."
    ),
  new_string: z.string().describe("The edited text to replace the old_string."),
});

/**
 * Documents control schema
 */
export const documentsControlSchema = z
  .object({
    action: z
      .enum(DOCUMENTS_ACTIONS)
      .describe(
        "Action to perform: 'list' returns synced /Documents files with their names and exact paths, 'read' returns a document's content, 'write' creates or overwrites/appends/prepends a document, and 'edit' replaces one exact string match inside a document."
      ),
    path: z
      .string()
      .optional()
      .describe(
        "For 'read', 'write', and 'edit': full document path under /Documents, e.g. '/Documents/notes.md'."
      ),
    content: z
      .string()
      .optional()
      .describe("For 'write': markdown content to save. Required for writes."),
    mode: z
      .enum(DOCUMENT_WRITE_MODES)
      .optional()
      .default("overwrite")
      .describe(
        "For 'write': 'overwrite' replaces content, 'append' adds to the end, 'prepend' adds to the start."
      ),
    old_string: z
      .string()
      .optional()
      .describe(
        "For 'edit': exact text to replace. Must match uniquely within the document."
      ),
    new_string: z.string().optional().describe("For 'edit': replacement text."),
  })
  .superRefine((data, ctx) => {
    const path = data.path?.trim();
    const requiresPath =
      data.action === "read" || data.action === "write" || data.action === "edit";

    if (requiresPath && !path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The '${data.action}' action requires the 'path' parameter.`,
        path: ["path"],
      });
    }

    if (path) {
      if (!path.startsWith("/Documents/")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Document paths must be under /Documents.",
          path: ["path"],
        });
      }
      if (!path.endsWith(".md")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Document paths must end with .md.",
          path: ["path"],
        });
      }
    }

    if (data.action === "write" && data.content === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'write' action requires the 'content' parameter.",
        path: ["content"],
      });
    }

    if (data.action === "edit" && data.old_string === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'edit' action requires the 'old_string' parameter.",
        path: ["old_string"],
      });
    }

    if (data.action === "edit" && data.new_string === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The 'edit' action requires the 'new_string' parameter.",
        path: ["new_string"],
      });
    }
  });
