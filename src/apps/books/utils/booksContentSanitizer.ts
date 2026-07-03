/**
 * Script sanitizer for EPUB section documents.
 *
 * The reader renders sections with `allowScriptedContent: true` because WebKit
 * refuses to start the long-press text-selection gesture (and swallows other
 * events) inside a `sandbox="allow-same-origin"` iframe that lacks
 * `allow-scripts` — text selection in Books is simply dead on iOS otherwise
 * (https://bugs.webkit.org/show_bug.cgi?id=218086; Jellyfin and
 * epubjs-react-native ship the same workaround).
 *
 * `allow-scripts` + `allow-same-origin` would let a malicious EPUB run
 * publisher JavaScript with full access to the ryOS origin (localStorage,
 * auth token), so every section document is sanitized here BEFORE epub.js
 * serializes it into the iframe: script elements, nested browsing contexts,
 * inline event handlers, and `javascript:` URLs are all removed.
 */

/** Elements that execute script or host nested browsing contexts / plugins. */
const FORBIDDEN_ELEMENT_SELECTOR =
  "script, iframe, frame, object, embed, applet, portal";

/** URL-valued attributes that could carry a `javascript:` payload. */
const URL_ATTRIBUTES = [
  "href",
  "src",
  "xlink:href",
  "action",
  "formaction",
  "data",
  "poster",
];

function hasJavascriptUrl(value: string | null): boolean {
  if (!value) return false;
  // Control/whitespace characters are stripped by URL parsers, so remove them
  // before matching (`java\nscript:` is a classic filter bypass).
  // eslint-disable-next-line no-control-regex
  const normalized = value.replace(/[\u0000-\u0020]/g, "").toLowerCase();
  return normalized.startsWith("javascript:");
}

/**
 * Strip active content from an EPUB section document in place. Returns the
 * number of removed/neutralized nodes and attributes (0 = document was clean).
 */
export function sanitizeEpubSectionDocument(document: Document): number {
  let removedCount = 0;

  // Type selectors match by local name regardless of namespace, so this also
  // covers SVG <script> elements.
  document.querySelectorAll(FORBIDDEN_ELEMENT_SELECTOR).forEach((element) => {
    element.remove();
    removedCount += 1;
  });

  document.querySelectorAll("*").forEach((element) => {
    // Inline event handlers (onclick, onload, …).
    for (const attr of Array.from(element.attributes)) {
      if (attr.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attr.name);
        removedCount += 1;
      }
    }

    // javascript: URLs on links, images, forms, media posters, …
    for (const attrName of URL_ATTRIBUTES) {
      if (hasJavascriptUrl(element.getAttribute(attrName))) {
        element.removeAttribute(attrName);
        removedCount += 1;
      }
    }
  });

  return removedCount;
}
