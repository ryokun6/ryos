import DOMPurify from "dompurify";

/**
 * Sanitizes untrusted HTML before rendering inside iframe srcDoc.
 * Scripts and nested browsing contexts are removed to reduce XSS risk.
 */
export function sanitizeHtmlForSrcDoc(content: string): string {
  if (!content) return content;
  if (typeof window === "undefined") return content;

  return DOMPurify.sanitize(content, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
  });
}
