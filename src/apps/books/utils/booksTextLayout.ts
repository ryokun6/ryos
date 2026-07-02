import type { BooksTextLayout } from "@/stores/useBooksStore";

type TrackedStyleProperty =
  | "writing-mode"
  | "-webkit-writing-mode"
  | "text-orientation"
  | "direction";

const TRACKED_STYLE_PROPERTIES: readonly TrackedStyleProperty[] = [
  "writing-mode",
  "-webkit-writing-mode",
  "text-orientation",
  "direction",
];
const OVERRIDE_MARKER = "data-ryos-text-layout-override";
const ORIGINAL_STYLE_PREFIX = "data-ryos-text-layout-original";

function originalStyleAttribute(
  property: TrackedStyleProperty,
  part: "value" | "priority"
): string {
  return `${ORIGINAL_STYLE_PREFIX}-${property.replaceAll("-", "_")}-${part}`;
}

function rememberPublisherStyles(root: HTMLElement): void {
  if (root.getAttribute(OVERRIDE_MARKER) === "true") return;

  for (const property of TRACKED_STYLE_PROPERTIES) {
    root.setAttribute(
      originalStyleAttribute(property, "value"),
      root.style.getPropertyValue(property)
    );
    root.setAttribute(
      originalStyleAttribute(property, "priority"),
      root.style.getPropertyPriority(property)
    );
  }
  root.setAttribute(OVERRIDE_MARKER, "true");
}

function restorePublisherStyles(root: HTMLElement): void {
  if (root.getAttribute(OVERRIDE_MARKER) !== "true") return;

  for (const property of TRACKED_STYLE_PROPERTIES) {
    const value = root.getAttribute(originalStyleAttribute(property, "value"));
    const priority =
      root.getAttribute(originalStyleAttribute(property, "priority")) ?? "";

    if (value) {
      root.style.setProperty(property, value, priority);
    } else {
      root.style.removeProperty(property);
    }
    root.removeAttribute(originalStyleAttribute(property, "value"));
    root.removeAttribute(originalStyleAttribute(property, "priority"));
  }
  root.removeAttribute(OVERRIDE_MARKER);
}

/**
 * Set the principal writing mode before epub.js measures a section. epub.js
 * detects vertical pagination from the EPUB document's root element.
 */
export function applyEpubTextLayout(
  document: Document,
  textLayout: BooksTextLayout
): void {
  const root = document.documentElement;
  if (!root) return;

  if (textLayout === "book") {
    restorePublisherStyles(root);
    return;
  }

  rememberPublisherStyles(root);
  root.style.setProperty("writing-mode", "vertical-rl", "important");
  root.style.setProperty("-webkit-writing-mode", "vertical-rl", "important");
  root.style.setProperty("text-orientation", "mixed", "important");
  root.style.setProperty("direction", "ltr", "important");
}

export function resolveEpubPageDirection(
  textLayout: BooksTextLayout,
  publisherDirection: unknown
): "ltr" | "rtl" {
  if (textLayout === "vertical") return "rtl";
  return publisherDirection === "rtl" ? "rtl" : "ltr";
}
