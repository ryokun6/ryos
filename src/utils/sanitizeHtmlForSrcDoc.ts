import DOMPurify from "dompurify";

interface SanitizeSrcDocOptions {
  allowScripts?: boolean;
}

/**
 * Sanitizes untrusted HTML before rendering inside iframe srcDoc.
 * By default scripts are removed; callers can opt in when script execution
 * is required inside the sandboxed iframe.
 */
export function sanitizeHtmlForSrcDoc(
  content: string,
  options: SanitizeSrcDocOptions = {}
): string {
  if (!content) return content;
  if (typeof window === "undefined") return content;
  const { allowScripts = false } = options;

  if (allowScripts) {
    return DOMPurify.sanitize(content, {
      USE_PROFILES: { html: true },
      ADD_TAGS: ["script"],
      ADD_ATTR: [
        "type",
        "src",
        "async",
        "defer",
        "integrity",
        "crossorigin",
        "referrerpolicy",
        "nomodule",
      ],
      FORBID_TAGS: ["iframe", "object", "embed"],
    });
  }

  return DOMPurify.sanitize(content, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "iframe", "object", "embed"],
  });
}
