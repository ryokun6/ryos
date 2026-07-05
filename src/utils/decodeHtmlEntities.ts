/**
 * Safely decode HTML entities without using innerHTML.
 * Uses DOMParser which does not execute scripts.
 *
 * Fully decodes entities (including double-encoded values) and strips HTML tags.
 * For API metadata that must decode only once, use `decodeHtmlEntitiesOnce` in
 * `api/_utils/html-entities.ts` instead.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  // Entities always start with "&" and the DOMParser path additionally
  // strips tags (which need "<"). When neither can be present, skip the
  // (expensive) full-document parse — this runs in streaming hot paths
  // (per text part, per throttled delta) and on every message row render.
  if (!text.includes("&") && !text.includes("<")) return text;
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
