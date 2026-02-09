const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const HTML_ENTITY_PATTERN = /&(amp|lt|gt|quot|#39|apos);/g;

/**
 * Decode a conservative set of HTML entities used by API responses.
 * Uses a single-pass replacement to avoid accidental double decoding.
 */
export const decodeHtmlEntities = (value: string): string => {
  if (!value || !value.includes("&")) {
    return value;
  }

  return value.replace(
    HTML_ENTITY_PATTERN,
    (entity) => HTML_ENTITY_MAP[entity] || entity
  );
};
