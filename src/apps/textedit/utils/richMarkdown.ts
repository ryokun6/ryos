const RICH_MARKDOWN_PREFIX = "<!-- RYOS_EDITOR_JSON:";
const RICH_MARKDOWN_REGEX =
  /^<!--\s*RYOS_EDITOR_JSON:([A-Za-z0-9+/=]+)\s*-->\s*\n?/;

const encodeBase64 = (value: string): string => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(unescape(encodeURIComponent(value)));
  }
  throw new Error("Base64 encoding is not available in this environment");
};

const decodeBase64 = (value: string): string => {
  if (typeof globalThis.atob === "function") {
    return decodeURIComponent(escape(globalThis.atob(value)));
  }
  throw new Error("Base64 decoding is not available in this environment");
};

export const serializeRichMarkdown = (
  markdown: string,
  editorJson: unknown
): string => {
  try {
    const jsonString = JSON.stringify(editorJson);
    const encodedJson = encodeBase64(jsonString);
    return `${RICH_MARKDOWN_PREFIX}${encodedJson} -->\n${markdown}`;
  } catch (error) {
    console.warn("[TextEdit] Failed to serialize rich markdown metadata:", error);
    return markdown;
  }
};

export const parseRichMarkdown = (
  rawContent: string
): { markdown: string; editorJson: unknown | null } => {
  const match = rawContent.match(RICH_MARKDOWN_REGEX);
  if (!match || !match[1]) {
    return { markdown: rawContent, editorJson: null };
  }

  const markdown = rawContent.replace(RICH_MARKDOWN_REGEX, "");

  try {
    const decoded = decodeBase64(match[1]);
    const parsed = JSON.parse(decoded);
    return { markdown, editorJson: parsed };
  } catch (error) {
    console.warn("[TextEdit] Failed to parse rich markdown metadata:", error);
    return { markdown, editorJson: null };
  }
};
