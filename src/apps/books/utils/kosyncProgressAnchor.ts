import type { Book, Rendition } from "epubjs";
import {
  isKoStyleXPath,
  parseKoXPath,
  type ParsedKoXPath,
} from "@/shared/kosyncProgressLocator";

export { isKoStyleXPath, isEpubCfi, parseKoXPath } from "@/shared/kosyncProgressLocator";

interface PathSegment {
  tag: string;
  index: number;
}

/** Count Unicode codepoints in a UTF-16 string (optionally truncated). */
export function countUnicodeCodePoints(text: string, utf16End?: number): number {
  const slice =
    utf16End !== undefined && utf16End >= 0 ? text.slice(0, utf16End) : text;
  let count = 0;
  for (const _ of slice) {
    count += 1;
  }
  return count;
}

/** UTF-16 index for a Unicode codepoint offset within `text`. */
export function utf16OffsetFromCodePointOffset(
  text: string,
  codePointOffset: number
): number {
  if (codePointOffset <= 0) return 0;
  let codePoints = 0;
  let utf16Index = 0;
  for (const char of text) {
    if (codePoints >= codePointOffset) break;
    codePoints += 1;
    utf16Index += char.length;
  }
  return utf16Index;
}

function localName(element: Element): string {
  const raw = element.localName || element.tagName || "";
  const colon = raw.indexOf(":");
  return (colon >= 0 ? raw.slice(colon + 1) : raw).toLowerCase();
}

function sameTagSiblingIndex(element: Element): number {
  const parent = element.parentElement;
  if (!parent) return 1;
  const tag = localName(element);
  let count = 0;
  for (const child of parent.children) {
    if (localName(child) === tag) {
      count += 1;
      if (child === element) return count;
    }
  }
  return 1;
}

function isInsideParagraphOrListItem(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const tag = localName(current as Element);
      if (tag === "p" || tag === "li") return true;
    }
    current = current.parentNode;
  }
  return false;
}

function resolveRangeTextAnchor(
  range: Range
): { textNode: Text; offset: number } | null {
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    return { textNode: startContainer as Text, offset: startOffset };
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    const element = startContainer as Element;
    const child = element.childNodes.item(startOffset);
    if (child?.nodeType === Node.TEXT_NODE) {
      return { textNode: child as Text, offset: 0 };
    }
    if (child?.nodeType === Node.ELEMENT_NODE) {
      const walker = (child as Element).ownerDocument?.createTreeWalker(
        child,
        NodeFilter.SHOW_TEXT
      );
      const first = walker?.nextNode();
      if (first?.nodeType === Node.TEXT_NODE) {
        return { textNode: first as Text, offset: 0 };
      }
    }
  }
  return null;
}

function nonEmptyTextNodeIndex(textNode: Text): number {
  const parent = textNode.parentElement;
  if (!parent) return 0;
  let index = 0;
  for (const child of parent.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    const value = child.textContent ?? "";
    if (value.length === 0) continue;
    index += 1;
    if (child === textNode) return index;
  }
  return 0;
}

function buildAncestorPath(from: Element, body: Element): PathSegment[] {
  const segments: PathSegment[] = [];
  let current: Element | null = from;
  while (current && current !== body) {
    segments.unshift({
      tag: localName(current),
      index: sameTagSiblingIndex(current),
    });
    current = current.parentElement;
  }
  return segments;
}

function formatKoXPath(
  docFragmentIndex: number,
  segments: PathSegment[],
  textNodeIndex: number,
  charOffset: number
): string {
  let xpath = `/body/DocFragment[${docFragmentIndex}]/body`;
  for (const segment of segments) {
    xpath += `/${segment.tag}[${segment.index}]`;
  }
  if (textNodeIndex > 0 && charOffset > 0) {
    xpath += `/text()[${textNodeIndex}].${charOffset}`;
  }
  return xpath;
}

/**
 * Convert a DOM Range inside an EPUB section to a CrossPoint-compatible XPath.
 * Returns null when the anchor is outside paragraph/list text or the DOM shape
 * cannot be represented.
 */
export function rangeToKoXPath(
  range: Range,
  docFragmentIndex: number
): string | null {
  if (docFragmentIndex < 1) return null;
  const anchor = resolveRangeTextAnchor(range);
  if (!anchor) return null;
  if (!isInsideParagraphOrListItem(anchor.textNode)) return null;

  const parentElement = anchor.textNode.parentElement;
  const body = parentElement?.ownerDocument?.body;
  if (!parentElement || !body) return null;

  const textNodeIndex = nonEmptyTextNodeIndex(anchor.textNode);
  if (textNodeIndex < 1) return null;

  const text = anchor.textNode.textContent ?? "";
  const charOffset = countUnicodeCodePoints(text, anchor.offset);
  const segments = buildAncestorPath(parentElement, body);
  return formatKoXPath(docFragmentIndex, segments, textNodeIndex, charOffset);
}

function walkKoXPathSteps(doc: Document, parsed: ParsedKoXPath): Element | null {
  let element: Element | null = doc.body;
  if (!element) return null;

  for (const step of parsed.steps) {
    let match: Element | null = null;
    let count = 0;
    for (const child of element.children) {
      if (localName(child) !== step.tag) continue;
      count += 1;
      if (count === step.index) {
        match = child;
        break;
      }
    }
    if (!match) return null;
    element = match;
  }

  return element;
}

/**
 * Resolve a CrossPoint XPath against a loaded EPUB section document.
 */
export function koXPathToRange(doc: Document, xpath: string): Range | null {
  const parsed = parseKoXPath(xpath);
  if (!parsed) return null;

  const element = walkKoXPathSteps(doc, parsed);
  if (!element) return null;

  const range = doc.createRange();

  if (parsed.charOffset <= 0 && parsed.textNodeIndex <= 1) {
    range.setStart(element, 0);
    range.collapse(true);
    return range;
  }

  let textIndex = 0;
  let target: Text | null = null;
  for (const child of element.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) continue;
    const value = child.textContent ?? "";
    if (value.length === 0) continue;
    textIndex += 1;
    if (textIndex === parsed.textNodeIndex) {
      target = child as Text;
      break;
    }
  }

  if (!target) return null;
  const text = target.textContent ?? "";
  const utf16Offset = utf16OffsetFromCodePointOffset(text, parsed.charOffset);
  range.setStart(target, Math.min(utf16Offset, text.length));
  range.collapse(true);
  return range;
}

/** Load the spine section referenced by `xpath` and convert it to an EPUB CFI. */
export async function koXPathToCfi(
  book: Book,
  xpath: string
): Promise<string | null> {
  const parsed = parseKoXPath(xpath);
  if (!parsed) return null;

  const spineIndex = parsed.docFragmentIndex - 1;
  const section = book.spine.get(spineIndex);
  if (!section) return null;

  try {
    await section.load(book.load.bind(book));
    const doc = section.document;
    if (!doc) return null;
    const range = koXPathToRange(doc, xpath);
    if (!range) return null;
    return section.cfiFromRange(range);
  } catch {
    return null;
  } finally {
    try {
      section.unload();
    } catch {
      // ignore
    }
  }
}

/** Derive CrossPoint XPath from the current epub.js rendition location. */
export function cfiToKoXPath(
  rendition: Rendition,
  cfi: string
): string | null {
  if (!cfi.trim()) return null;
  try {
    const range = rendition.getRange(cfi);
    if (!range) return null;
    const location = rendition.currentLocation() as {
      start?: { index?: number };
    } | null;
    const spineIndex = location?.start?.index;
    if (spineIndex === undefined || spineIndex < 0) return null;
    return rangeToKoXPath(range, spineIndex + 1);
  } catch {
    return null;
  }
}
