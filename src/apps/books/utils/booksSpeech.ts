/**
 * Read-aloud helpers for the Books reader, built on the browser's native
 * SpeechSynthesis API (no AI TTS). The visible epub.js page is split into
 * sentence-sized chunks, each paired with a DOM Range so the active sentence
 * can be highlighted while it is spoken.
 */

export interface BooksSpeechChunk {
  /** Whitespace-normalized text handed to SpeechSynthesisUtterance. */
  text: string;
  /** Range covering the chunk inside the EPUB section document. */
  range: Range;
}

export interface SpeechTextSegment {
  /** Inclusive start offset into the source string. */
  start: number;
  /** Exclusive end offset into the source string. */
  end: number;
}

/** Chunks longer than this are split at word boundaries. Keeping utterances
 * short avoids the long-standing Chrome bug where long utterances stall. */
export const BOOKS_SPEECH_MAX_CHUNK_LENGTH = 240;

const LATIN_TERMINATORS = new Set([".", "!", "?", "…"]);
const CJK_TERMINATORS = new Set(["。", "！", "？", "；"]);
const CLOSING_MARKS = new Set([
  '"',
  "'",
  ")",
  "]",
  "»",
  "\u201d", // ”
  "\u2019", // ’
  "』",
  "」",
  "）",
  "〉",
  "》",
]);
const SOFT_BREAK_CHARS = new Set([",", ";", ":", "，", "、", "：", " "]);

const isWhitespace = (ch: string): boolean => /\s/.test(ch);

/**
 * Split text into sentence boundaries (offsets into the input). Latin
 * terminators only break when followed by whitespace (so "3.14" stays whole);
 * CJK terminators break immediately.
 */
export function splitTextIntoSentences(text: string): SpeechTextSegment[] {
  const boundaries: number[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (CJK_TERMINATORS.has(ch)) {
      let j = i + 1;
      while (j < text.length && CLOSING_MARKS.has(text[j])) j++;
      boundaries.push(j);
      i = j;
      continue;
    }
    if (LATIN_TERMINATORS.has(ch)) {
      let j = i + 1;
      while (j < text.length && LATIN_TERMINATORS.has(text[j])) j++;
      let k = j;
      while (k < text.length && CLOSING_MARKS.has(text[k])) k++;
      if (k >= text.length || isWhitespace(text[k])) {
        boundaries.push(k);
        i = k;
        continue;
      }
      i = j;
      continue;
    }
    i++;
  }

  const segments: SpeechTextSegment[] = [];
  let start = 0;
  for (const boundary of [...boundaries, text.length]) {
    if (boundary <= start) continue;
    const trimmed = trimSegment(text, start, boundary);
    if (trimmed) segments.push(trimmed);
    start = boundary;
  }
  return segments;
}

function trimSegment(
  text: string,
  start: number,
  end: number
): SpeechTextSegment | null {
  while (start < end && isWhitespace(text[start])) start++;
  while (end > start && isWhitespace(text[end - 1])) end--;
  return end > start ? { start, end } : null;
}

function splitLongSegment(
  text: string,
  segment: SpeechTextSegment,
  maxLength: number
): SpeechTextSegment[] {
  const result: SpeechTextSegment[] = [];
  let { start } = segment;
  while (segment.end - start > maxLength) {
    // Prefer breaking at the last soft-break char within the window.
    let breakAt = -1;
    for (let i = start + maxLength - 1; i > start; i--) {
      if (SOFT_BREAK_CHARS.has(text[i])) {
        breakAt = i + 1;
        break;
      }
    }
    if (breakAt <= start) breakAt = start + maxLength;
    const trimmed = trimSegment(text, start, breakAt);
    if (trimmed) result.push(trimmed);
    start = breakAt;
  }
  const tail = trimSegment(text, start, segment.end);
  if (tail) result.push(tail);
  return result;
}

/** Sentence segments, additionally splitting overlong sentences. */
export function splitTextIntoSpeechSegments(
  text: string,
  maxLength: number = BOOKS_SPEECH_MAX_CHUNK_LENGTH
): SpeechTextSegment[] {
  return splitTextIntoSentences(text).flatMap((segment) =>
    segment.end - segment.start > maxLength
      ? splitLongSegment(text, segment, maxLength)
      : [segment]
  );
}

// ---------------------------------------------------------------------------
// Visible-page extraction
// ---------------------------------------------------------------------------

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "BODY",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TD",
  "TH",
  "TR",
  "UL",
]);

const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "TITLE",
  "HEAD",
]);

function isSpokenTextNode(node: Text): boolean {
  for (
    let el: Element | null = node.parentElement;
    el;
    el = el.parentElement
  ) {
    if (SKIPPED_TAGS.has(el.tagName)) return false;
    if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("hidden")) {
      return false;
    }
  }
  return true;
}

function getBlockAncestor(node: Text): Element | null {
  for (
    let el: Element | null = node.parentElement;
    el;
    el = el.parentElement
  ) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
  }
  return node.parentElement;
}

interface TextPiece {
  node: Text;
  /** Start offset within the node. */
  start: number;
  /** Exclusive end offset within the node. */
  end: number;
  /** Cumulative start offset within the owning paragraph string. */
  paragraphStart: number;
}

interface Paragraph {
  text: string;
  pieces: TextPiece[];
}

/**
 * Compare boundary point (nodeA, offsetA) against (nodeB, offsetB) in
 * document order: -1 when A comes first, 1 when B comes first, 0 when equal.
 * Implemented on top of compareDocumentPosition instead of
 * Range.compareBoundaryPoints so it also behaves correctly in happy-dom
 * (whose compareBoundaryPoints is not spec-compliant), keeping the chunker
 * unit-testable.
 */
function compareBoundaryPoints(
  nodeA: Node,
  offsetA: number,
  nodeB: Node,
  offsetB: number
): number {
  if (nodeA === nodeB) {
    return offsetA < offsetB ? -1 : offsetA > offsetB ? 1 : 0;
  }
  const position = nodeA.compareDocumentPosition(nodeB);
  if (position & Node.DOCUMENT_POSITION_CONTAINED_BY) {
    // nodeB is inside nodeA — find nodeA's child on the path to nodeB.
    let child: Node = nodeB;
    while (child.parentNode && child.parentNode !== nodeA) {
      child = child.parentNode;
    }
    const index = Array.prototype.indexOf.call(nodeA.childNodes, child);
    return offsetA <= index ? -1 : 1;
  }
  if (position & Node.DOCUMENT_POSITION_CONTAINS) {
    // nodeA is inside nodeB — find nodeB's child on the path to nodeA.
    let child: Node = nodeA;
    while (child.parentNode && child.parentNode !== nodeB) {
      child = child.parentNode;
    }
    const index = Array.prototype.indexOf.call(nodeB.childNodes, child);
    return index < offsetB ? -1 : 1;
  }
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function nodeOverlapsRange(node: Text, range: Range): boolean {
  const length = node.data.length;
  return (
    // Node end after range start…
    compareBoundaryPoints(
      node,
      length,
      range.startContainer,
      range.startOffset
    ) > 0 &&
    // …and node start before range end.
    compareBoundaryPoints(node, 0, range.endContainer, range.endOffset) < 0
  );
}

/** Collect visible text grouped into paragraphs (block-level runs). */
function collectParagraphs(range: Range): Paragraph[] {
  const container = range.commonAncestorContainer;
  const doc =
    container.nodeType === Node.DOCUMENT_NODE
      ? (container as Document)
      : container.ownerDocument;
  if (!doc) return [];

  // TreeWalker never yields its root, so when the whole range sits inside a
  // single text node, walk from the parent element instead.
  const walkRoot =
    container.nodeType === Node.TEXT_NODE
      ? container.parentNode ?? container
      : container;
  const walker = doc.createTreeWalker(
    walkRoot,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
  );

  const paragraphs: Paragraph[] = [];
  let currentPieces: TextPiece[] = [];
  let currentText = "";
  let currentBlock: Element | null = null;

  const closeParagraph = () => {
    if (currentText.length > 0) {
      paragraphs.push({ text: currentText, pieces: currentPieces });
    }
    currentPieces = [];
    currentText = "";
  };

  for (
    let node = walker.nextNode();
    node !== null;
    node = walker.nextNode()
  ) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Explicit line breaks split poetry/verse into speakable lines.
      if ((node as Element).tagName === "BR") closeParagraph();
      continue;
    }
    const textNode = node as Text;
    if (!nodeOverlapsRange(textNode, range)) continue;
    if (!isSpokenTextNode(textNode)) continue;

    let start = 0;
    let end = textNode.data.length;
    if (range.startContainer === textNode) {
      start = Math.max(start, range.startOffset);
    }
    if (range.endContainer === textNode) {
      end = Math.min(end, range.endOffset);
    }
    if (end <= start) continue;

    const block = getBlockAncestor(textNode);
    if (block !== currentBlock) {
      closeParagraph();
      currentBlock = block;
    }

    currentPieces.push({
      node: textNode,
      start,
      end,
      paragraphStart: currentText.length,
    });
    currentText += textNode.data.slice(start, end);
  }
  closeParagraph();
  return paragraphs;
}

function paragraphOffsetToPosition(
  pieces: TextPiece[],
  offset: number,
  kind: "start" | "end"
): { node: Text; offset: number } | null {
  for (const piece of pieces) {
    const length = piece.end - piece.start;
    const within =
      kind === "start"
        ? offset >= piece.paragraphStart && offset < piece.paragraphStart + length
        : offset > piece.paragraphStart && offset <= piece.paragraphStart + length;
    if (within) {
      return { node: piece.node, offset: piece.start + (offset - piece.paragraphStart) };
    }
  }
  return null;
}

/**
 * Split the given page range into speakable sentence chunks, each with a
 * Range for highlighting.
 */
export function collectSpeechChunksFromRange(range: Range): BooksSpeechChunk[] {
  const chunks: BooksSpeechChunk[] = [];
  for (const paragraph of collectParagraphs(range)) {
    for (const segment of splitTextIntoSpeechSegments(paragraph.text)) {
      const text = paragraph.text
        .slice(segment.start, segment.end)
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      const startPos = paragraphOffsetToPosition(
        paragraph.pieces,
        segment.start,
        "start"
      );
      const endPos = paragraphOffsetToPosition(
        paragraph.pieces,
        segment.end,
        "end"
      );
      if (!startPos || !endPos) continue;
      const doc = startPos.node.ownerDocument;
      if (!doc) continue;
      try {
        const chunkRange = doc.createRange();
        chunkRange.setStart(startPos.node, startPos.offset);
        chunkRange.setEnd(endPos.node, endPos.offset);
        chunks.push({ text, range: chunkRange });
      } catch {
        // Skip chunks whose boundaries can't form a valid range.
      }
    }
  }
  return chunks;
}

/** Minimal shape of the epub.js Rendition APIs used for speech. */
export interface SpeechRenditionLike {
  currentLocation: () => unknown;
  getRange: (cfi: string) => Range | null | undefined;
}

/**
 * Build a Range spanning the currently visible page(s) of a paginated
 * epub.js rendition, using the relocated location's start/end CFIs.
 */
export function getVisiblePageRange(
  rendition: SpeechRenditionLike
): Range | null {
  const location = rendition.currentLocation() as {
    start?: { cfi?: string };
    end?: { cfi?: string };
  } | null;
  const startCfi = location?.start?.cfi;
  const endCfi = location?.end?.cfi;
  if (!startCfi) return null;

  let startRange: Range | null = null;
  let endRange: Range | null = null;
  try {
    startRange = rendition.getRange(startCfi) ?? null;
  } catch {
    startRange = null;
  }
  if (!startRange) return null;
  if (endCfi) {
    try {
      endRange = rendition.getRange(endCfi) ?? null;
    } catch {
      endRange = null;
    }
  }

  const doc = startRange.startContainer.ownerDocument;
  const range = startRange.cloneRange();
  if (
    endRange &&
    endRange.endContainer.ownerDocument === doc &&
    doc !== null
  ) {
    try {
      range.setEnd(endRange.endContainer, endRange.endOffset);
    } catch {
      // Keep the start-only range; extended below if still collapsed.
    }
  }
  if (range.collapsed && doc?.body) {
    // No usable end boundary — speak to the end of the section instead.
    try {
      range.setEnd(doc.body, doc.body.childNodes.length);
    } catch {
      return null;
    }
  }
  return range.collapsed ? null : range;
}

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

export const BOOKS_SPEECH_HIGHLIGHT_NAME = "ryos-books-speech";
export const BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS = "ryos-books-speech-block";

/** Injected into each EPUB section document alongside the reader fonts. */
export const BOOKS_SPEECH_HIGHLIGHT_CSS = `
::highlight(${BOOKS_SPEECH_HIGHLIGHT_NAME}) {
  background-color: rgba(255, 193, 47, 0.45);
  color: inherit;
}
.${BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS} {
  background-color: rgba(255, 193, 47, 0.3);
}
`;

interface HighlightCapableWindow extends Window {
  Highlight?: new (...ranges: Range[]) => Highlight;
  CSS?: typeof CSS;
}

function getHighlightWindow(doc: Document | null | undefined) {
  const win = doc?.defaultView as HighlightCapableWindow | null | undefined;
  if (!win) return null;
  if (typeof win.Highlight !== "function" || !win.CSS?.highlights) return null;
  return win as HighlightCapableWindow & {
    Highlight: new (...ranges: Range[]) => Highlight;
    CSS: typeof CSS & { highlights: HighlightRegistry };
  };
}

/**
 * Highlight the chunk being spoken. Uses the CSS Custom Highlight API when
 * available (sentence-precise, no DOM mutation); otherwise falls back to
 * tinting the containing block element(s).
 */
export function applySpeechHighlight(range: Range): void {
  const doc = range.startContainer.ownerDocument;
  if (!doc) return;
  clearSpeechHighlight(doc);

  const win = getHighlightWindow(doc);
  if (win) {
    try {
      win.CSS.highlights.set(
        BOOKS_SPEECH_HIGHLIGHT_NAME,
        new win.Highlight(range)
      );
      return;
    } catch {
      // Fall through to the block-class fallback.
    }
  }

  for (const container of [range.startContainer, range.endContainer]) {
    const element =
      container.nodeType === Node.TEXT_NODE
        ? getBlockAncestor(container as Text)
        : (container as Element | null);
    element?.classList?.add(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS);
  }
}

export function clearSpeechHighlight(doc: Document | null | undefined): void {
  if (!doc) return;
  const win = getHighlightWindow(doc);
  try {
    win?.CSS.highlights.delete(BOOKS_SPEECH_HIGHLIGHT_NAME);
  } catch {
    // ignore
  }
  doc
    .querySelectorAll(`.${BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS}`)
    .forEach((el) => el.classList.remove(BOOKS_SPEECH_HIGHLIGHT_BLOCK_CLASS));
}
