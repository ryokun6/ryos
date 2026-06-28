import DOMPurify from "dompurify";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const SAFE_MARKDOWN_TAGS = [
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "input",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
];

const SAFE_MARKDOWN_ATTRIBUTES = [
  "align",
  "checked",
  "disabled",
  "href",
  "start",
  "title",
  "type",
];

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeSanitize, {
    attributes: {
      a: ["href", "title"],
      input: [["type", "checkbox"], "checked", "disabled"],
      ol: ["start"],
      td: ["align"],
      th: ["align"],
    },
    protocols: {
      href: ["http", "https", "mailto", "tel"],
    },
    tagNames: SAFE_MARKDOWN_TAGS,
  })
  .use(rehypeStringify);

const TABLE_DELIMITER_PATTERN =
  /^ {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const BLOCK_MARKDOWN_PATTERNS = [
  /^ {0,3}#{1,6}\s+\S/,
  /^ {0,3}(?:```|~~~)/,
  /^ {0,3}>\s+\S/,
  /^ {0,3}[-+*]\s+\S/,
  /^ {0,3}\d+[.)]\s+\S/,
  /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/,
];
const MARKDOWN_LINK_PATTERN = /\[[^\]\n]+\]\(\s*[^)\n]+\)/;

interface ClipboardTextReader {
  getData(format: string): string;
}

function hasGfmTable(lines: string[]): boolean {
  return lines.some((line, index) => {
    if (index === 0 || !TABLE_DELIMITER_PATTERN.test(line)) {
      return false;
    }

    const header = lines[index - 1].trim();
    return header.includes("|") && /[^|\s]/.test(header);
  });
}

/**
 * Keeps ordinary prose on the browser's native plain-text paste path while
 * recognizing Markdown structures that have a meaningful rich-text form.
 */
export function isMeaningfulMarkdown(text: string): boolean {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.trim()) {
    return false;
  }

  const lines = normalized.split("\n");
  if (hasGfmTable(lines)) {
    return true;
  }

  if (lines.some((line) => BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(line)))) {
    return true;
  }

  if (lines.some((line, index) => index > 0 && /^ {0,3}(?:={3,}|-{3,})\s*$/.test(line))) {
    return true;
  }

  return MARKDOWN_LINK_PATTERN.test(normalized);
}

export function getMarkdownTextForPaste(
  clipboardData: ClipboardTextReader
): string | null {
  if (clipboardData.getData("text/html").trim()) {
    return null;
  }

  const markdown =
    clipboardData.getData("text/markdown") ||
    clipboardData.getData("text/plain");
  return isMeaningfulMarkdown(markdown) ? markdown : null;
}

/**
 * Parses CommonMark + GFM without passing raw HTML into the output, then
 * applies a strict DOMPurify allowlist as a browser-side defense in depth.
 */
export function markdownToSafeHtml(markdown: string): string {
  const generatedHtml = String(markdownProcessor.processSync(markdown));

  return sanitizeHtmlForEditor(generatedHtml);
}

/**
 * Sanitizes HTML before it enters TipTap through TextEdit import/load paths.
 * TipTap also filters by schema, but this strips unsafe attributes and links
 * before ProseMirror has to interpret them.
 */
export function sanitizeHtmlForEditor(html: string): string {
  if (typeof window === "undefined") {
    return html;
  }

  const purifier = DOMPurify(window);
  if (typeof purifier.sanitize !== "function") {
    return html;
  }

  return String(
    purifier.sanitize(html, {
      ALLOWED_ATTR: SAFE_MARKDOWN_ATTRIBUTES,
      ALLOWED_TAGS: SAFE_MARKDOWN_TAGS,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
    })
  );
}
