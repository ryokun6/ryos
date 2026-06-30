import type { JSONContent } from "@tiptap/core";
import { markdownToSafeHtml, sanitizeHtmlForEditor } from "./markdownPaste";
import { parseRichMarkdown } from "./richMarkdown";

type EditorMark = NonNullable<JSONContent["marks"]>[number];

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeHref(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  try {
    const parsed = new URL(trimmed, "https://ryos.local");
    return SAFE_LINK_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeAttrs(attrs: unknown): Record<string, unknown> | undefined {
  if (!isRecord(attrs)) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "href" && !isSafeHref(value)) {
      continue;
    }
    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeMark(mark: unknown): EditorMark | null {
  if (!isRecord(mark) || typeof mark.type !== "string") {
    return null;
  }

  const attrs = sanitizeAttrs(mark.attrs);
  if (mark.type === "link" && !attrs?.href) {
    return null;
  }

  return attrs ? { type: mark.type, attrs } : { type: mark.type };
}

function sanitizeEditorJsonContent(value: unknown): JSONContent | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  const sanitized: JSONContent = { type: value.type };
  if (typeof value.text === "string") {
    sanitized.text = value.text;
  }

  const attrs = sanitizeAttrs(value.attrs);
  if (attrs) {
    sanitized.attrs = attrs;
  }

  if (Array.isArray(value.marks)) {
    const marks = value.marks
      .map(sanitizeMark)
      .filter((mark): mark is EditorMark => mark !== null);
    if (marks.length > 0) {
      sanitized.marks = marks;
    }
  }

  if (Array.isArray(value.content)) {
    const content = value.content
      .map(sanitizeEditorJsonContent)
      .filter((node): node is JSONContent => node !== null);
    if (content.length > 0) {
      sanitized.content = content;
    }
  }

  return sanitized;
}

function escapeHtmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function plainTextToEditorHtml(text: string): string {
  return `<p>${escapeHtmlText(text).replaceAll(/\r\n?|\n/g, "<br>")}</p>`;
}

/**
 * Convert a persisted document string (as stored in IndexedDB) into content the
 * TipTap editor can ingest. Returns either TipTap/ProseMirror JSON (preferred,
 * when the rich-markdown metadata header is present) or an HTML string.
 *
 * This mirrors the conversion used when first loading a file so that reactive
 * updates produce the same document shape as an initial open.
 */
export function persistedContentToEditorContent(
  path: string,
  contentStr: string
): JSONContent | string {
  const normalizedPath = path.toLowerCase();

  if (normalizedPath.endsWith(".md")) {
    const parsed = parseRichMarkdown(contentStr);
    const safeEditorJson = sanitizeEditorJsonContent(parsed.editorJson);
    if (safeEditorJson) {
      return safeEditorJson;
    }
    return markdownToSafeHtml(parsed.markdown);
  }

  if (normalizedPath.endsWith(".html") || normalizedPath.endsWith(".htm")) {
    return sanitizeHtmlForEditor(contentStr);
  }

  try {
    const parsed: unknown = JSON.parse(contentStr);
    return sanitizeEditorJsonContent(parsed) ?? plainTextToEditorHtml(contentStr);
  } catch {
    return plainTextToEditorHtml(contentStr);
  }
}
