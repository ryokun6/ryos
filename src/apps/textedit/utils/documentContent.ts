import type { JSONContent } from "@tiptap/core";
import { markdownToHtml } from "@/utils/markdown";
import { parseRichMarkdown } from "./richMarkdown";

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
  if (path.endsWith(".md")) {
    const parsed = parseRichMarkdown(contentStr);
    if (parsed.editorJson) {
      return parsed.editorJson as JSONContent;
    }
    return markdownToHtml(parsed.markdown);
  }

  try {
    return JSON.parse(contentStr) as JSONContent;
  } catch {
    return `<p>${contentStr}</p>`;
  }
}
