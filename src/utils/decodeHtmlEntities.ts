/**
 * Safely decode HTML entities without using innerHTML.
 * Uses DOMParser which does not execute scripts.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
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
