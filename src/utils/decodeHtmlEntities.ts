/**
 * Safely decode HTML entities without using innerHTML.
 * Uses DOMParser which does not execute scripts.
 *
 * Hot path: chat message rendering calls this on every streaming delta
 * (potentially dozens of times per second per streaming message). The vast
 * majority of chat text has no entities at all, so we fast-path by checking
 * for `&` before constructing a DOMParser (which is quite heavy — it
 * allocates a full Document on every call).
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  // Fast path: no entity marker in text.
  if (text.indexOf("&") === -1) return text;
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return doc.documentElement.textContent ?? text;
  }
  // Fallback for non-browser environments: decode common entities
  const entityMap: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
  };
  return text.replace(
    /&(amp|lt|gt|quot|#39|apos);/g,
    (entity) => entityMap[entity] || entity
  );
}
