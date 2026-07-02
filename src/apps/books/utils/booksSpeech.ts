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
  /**
   * Set when the sentence is cut off by the end of the visible page and its
   * text was extended past the page boundary so it can be spoken whole:
   * offset into `text` where the visible page ends (the rest of the sentence
   * flows onto the next page). Used to auto-turn the page as speech crosses
   * the boundary.
   */
  pageEndCutIndex?: number;
}

/** Identity of a sentence spoken across an auto page turn, so speech on the
 * new page can skip already-spoken text. DOM endpoints help when live nodes
 * survive the flip; `spokenText` covers epub.js view re-renders that detach
 * the previous page's nodes (where range comparison alone fails open). */
export interface BooksSpeechCarryOver {
  endContainer: Node;
  endOffset: number;
  /** Normalized text of the sentence spoken across the page boundary. */
  spokenText: string;
  /** Offset into `spokenText` where the visible page ended, when known. */
  pageEndCutIndex?: number;
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

/** How far past the visible page end a cut-off sentence may be extended.
 * Generous enough to finish any sentence the chunker would speak whole. */
const MAX_PAGE_CUT_EXTENSION = BOOKS_SPEECH_MAX_CHUNK_LENGTH * 2;

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

/** Sentence-boundary offsets into the input (see splitTextIntoSentences). */
function findSentenceBoundaries(text: string): number[] {
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
  return boundaries;
}

/**
 * Split text into sentence boundaries (offsets into the input). Latin
 * terminators only break when followed by whitespace (so "3.14" stays whole);
 * CJK terminators break immediately.
 */
export function splitTextIntoSentences(text: string): SpeechTextSegment[] {
  const boundaries = findSentenceBoundaries(text);

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
  /**
   * Offset into `text` where the visible page ends, when the paragraph was
   * extended past the page boundary to finish a cut-off sentence.
   */
  pageCutOffset?: number;
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

/**
 * Whether `range` ends at or before the carried-over end position of the last
 * chunk spoken on the previous page (i.e. its text was already spoken).
 * Lenient (returns false) across documents or for detached nodes, so a
 * section change or re-render never skips fresh content.
 */
export function rangeEndsAtOrBefore(
  range: Range,
  carryOver: BooksSpeechCarryOver
): boolean {
  const { endContainer, endOffset } = carryOver;
  if (range.endContainer.ownerDocument !== endContainer.ownerDocument) {
    return false;
  }
  if (!endContainer.isConnected || !range.endContainer.isConnected) {
    return false;
  }
  try {
    return (
      compareBoundaryPoints(
        range.endContainer,
        range.endOffset,
        endContainer,
        endOffset
      ) <= 0
    );
  } catch {
    return false;
  }
}

/**
 * Estimate how long speech synthesis takes to reach `charIndex` in `text` at
 * the given rate. Used to auto-turn the page at a mid-sentence cut when the
 * engine does not deliver word-boundary events (typical for CJK voices, which
 * have no spaces between words).
 *
 * Tuned to sit near the spoken cutoff rather than leading it: flipping early
 * is jarring, and settle still advances at utterance end if we lag a little.
 */
export function estimateMsUntilCharIndex(
  charIndex: number,
  text: string,
  rate: number
): number {
  const limit = Math.max(0, Math.min(charIndex, text.length));
  let costMs = 0;
  for (let i = 0; i < limit; i++) {
    const code = text.charCodeAt(i);
    // CJK ideographs / punctuation speak slower per character than Latin
    // (~4–5 chars/s vs ~12–15 for Latin TTS at rate 1). Prefer lagging a
    // little over flipping early; settle still advances at utterance end.
    const isCjk =
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xffef) ||
      (code >= 0x3000 && code <= 0x303f);
    costMs += isCjk ? 220 : 70;
  }
  return Math.max(0, costMs / Math.max(rate, 0.5));
}

/**
 * Drop page-leading chunks already covered by a sentence spoken across a page
 * flip. Uses carried text (and the page-cut offset when known) so a view
 * re-render that detaches the previous page's nodes still can't re-speak the
 * same sentence; DOM endpoints refine the filter when they survive the flip.
 */
export function filterChunksAfterCarryOver(
  chunks: BooksSpeechChunk[],
  carryOver: BooksSpeechCarryOver
): BooksSpeechChunk[] {
  const spokenText = carryOver.spokenText.replace(/\s+/g, " ").trim();
  let remainder = "";
  if (spokenText) {
    const cut = carryOver.pageEndCutIndex;
    if (cut !== undefined && cut > 0 && cut < spokenText.length) {
      remainder = spokenText.slice(cut).replace(/^\s+/, "").trim();
    }
  }

  const kept: BooksSpeechChunk[] = [];
  let skippingLeading = Boolean(spokenText);
  for (const chunk of chunks) {
    if (skippingLeading) {
      if (rangeEndsAtOrBefore(chunk.range, carryOver)) {
        continue;
      }
      if (spokenText && chunk.text === spokenText) {
        continue;
      }
      if (remainder) {
        if (chunk.text === remainder || remainder.startsWith(chunk.text)) {
          remainder = remainder.slice(chunk.text.length).replace(/^\s+/, "");
          continue;
        }
      }
      skippingLeading = false;
    } else if (rangeEndsAtOrBefore(chunk.range, carryOver)) {
      continue;
    }
    kept.push(chunk);
  }
  return kept;
}

function getBlockAncestorOfNode(node: Node): Element | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return getBlockAncestor(node as Text);
  }
  for (
    let el: Element | null =
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
    el;
    el = el.parentElement
  ) {
    if (BLOCK_TAGS.has(el.tagName)) return el;
  }
  return null;
}

/**
 * Collect visible text grouped into paragraphs (block-level runs).
 *
 * When the range ends mid-sentence (a page boundary cutting a sentence in
 * half), the final paragraph is extended past the range end — within the
 * same block, up to the end of the cut sentence or a safety budget — and
 * `pageCutOffset` records where the visible page actually ends. Read-aloud
 * uses this to speak the sentence whole and turn the page at the cut instead
 * of stopping mid-sentence.
 */
function collectParagraphs(range: Range): Paragraph[] {
  const container = range.commonAncestorContainer;
  const doc =
    container.nodeType === Node.DOCUMENT_NODE
      ? (container as Document)
      : container.ownerDocument;
  if (!doc) return [];

  // TreeWalker never yields its root, so when the whole range sits inside a
  // single text node, walk from the parent element instead.
  let walkRoot =
    container.nodeType === Node.TEXT_NODE
      ? container.parentNode ?? container
      : container;
  // The remainder of a sentence cut at the range end may live outside the
  // range's common ancestor (e.g. the range ends inside an inline element);
  // widen the walk to the cut paragraph's block so the extension can see it.
  const endBlock = getBlockAncestorOfNode(range.endContainer);
  if (endBlock && endBlock !== walkRoot && endBlock.contains(walkRoot)) {
    walkRoot = endBlock;
  }
  const walker = doc.createTreeWalker(
    walkRoot,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
  );

  const paragraphs: Paragraph[] = [];
  let currentPieces: TextPiece[] = [];
  let currentText = "";
  let currentBlock: Element | null = null;
  // Offset in the current paragraph where the visible page ends; non-null
  // while collecting past the range end to finish a cut-off sentence.
  let cutOffset: number | null = null;
  let done = false;

  const closeParagraph = () => {
    if (currentText.length > 0) {
      const paragraph: Paragraph = { text: currentText, pieces: currentPieces };
      if (cutOffset !== null && cutOffset < currentText.length) {
        paragraph.pageCutOffset = cutOffset;
      }
      paragraphs.push(paragraph);
    }
    currentPieces = [];
    currentText = "";
    cutOffset = null;
  };

  const appendPiece = (node: Text, start: number, end: number) => {
    if (end <= start) return;
    currentPieces.push({
      node,
      start,
      end,
      paragraphStart: currentText.length,
    });
    currentText += node.data.slice(start, end);
  };

  const truncateTo = (offset: number) => {
    if (currentText.length <= offset) return;
    currentText = currentText.slice(0, offset);
    const kept: TextPiece[] = [];
    for (const piece of currentPieces) {
      if (piece.paragraphStart >= offset) break;
      const maxLength = offset - piece.paragraphStart;
      const length = Math.min(piece.end - piece.start, maxLength);
      kept.push(
        length === piece.end - piece.start
          ? piece
          : { ...piece, end: piece.start + length }
      );
    }
    currentPieces = kept;
  };

  // Whether the open paragraph ends mid-sentence at the cut point (real
  // content after its last sentence boundary).
  const paragraphCutMidSentence = (): boolean => {
    if (currentText.length === 0) return false;
    const boundaries = findSentenceBoundaries(currentText);
    const lastBoundary =
      boundaries.length > 0 ? boundaries[boundaries.length - 1] : 0;
    return trimSegment(currentText, lastBoundary, currentText.length) !== null;
  };

  // While extending past the cut, stop once the sentence is finished (or the
  // extension budget is exhausted). Nothing beyond the cut paragraph is
  // collected.
  const checkExtensionDone = () => {
    if (cutOffset === null) return;
    const cut = cutOffset;
    const boundary = findSentenceBoundaries(currentText).find((b) => b >= cut);
    if (boundary !== undefined) {
      truncateTo(boundary);
      done = true;
      closeParagraph();
      return;
    }
    if (currentText.length - cut > MAX_PAGE_CUT_EXTENSION) {
      truncateTo(cut + MAX_PAGE_CUT_EXTENSION);
      done = true;
      closeParagraph();
    }
  };

  for (
    let node = walker.nextNode();
    node !== null && !done;
    node = walker.nextNode()
  ) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Explicit line breaks split poetry/verse into speakable lines (and
      // end any cut-sentence extension — the line is the sentence).
      if ((node as Element).tagName === "BR") {
        if (cutOffset !== null) done = true;
        closeParagraph();
      }
      continue;
    }
    const textNode = node as Text;
    if (!isSpokenTextNode(textNode)) continue;
    const length = textNode.data.length;

    // Entirely before the range start.
    if (
      compareBoundaryPoints(
        textNode,
        length,
        range.startContainer,
        range.startOffset
      ) <= 0
    ) {
      continue;
    }

    let start = 0;
    if (range.startContainer === textNode) {
      start = Math.max(start, range.startOffset);
    }

    // Visible portion of the node, clipped at the range end. A boundary
    // point in another container never falls inside a text node, so the
    // node is either fully before or fully after it.
    let visibleEnd: number;
    if (range.endContainer === textNode) {
      visibleEnd = Math.min(length, range.endOffset);
    } else if (
      compareBoundaryPoints(
        textNode,
        0,
        range.endContainer,
        range.endOffset
      ) >= 0
    ) {
      visibleEnd = 0;
    } else {
      visibleEnd = length;
    }

    const block = getBlockAncestor(textNode);

    if (cutOffset !== null) {
      // Extending a cut sentence: only within the same block.
      if (block !== currentBlock) {
        done = true;
        closeParagraph();
        continue;
      }
      appendPiece(textNode, 0, length);
      checkExtensionDone();
      continue;
    }

    if (visibleEnd <= start) {
      // The visible range ended before this node. Extend if the open
      // paragraph was cut mid-sentence and this node continues its block;
      // otherwise the collection is complete.
      if (block === currentBlock && paragraphCutMidSentence()) {
        cutOffset = currentText.length;
        appendPiece(textNode, 0, length);
        checkExtensionDone();
      } else {
        done = true;
        closeParagraph();
      }
      continue;
    }

    if (block !== currentBlock) {
      closeParagraph();
      currentBlock = block;
    }
    appendPiece(textNode, start, visibleEnd);

    if (visibleEnd < length) {
      // The visible range ends inside this node — the page cuts here.
      if (paragraphCutMidSentence()) {
        cutOffset = currentText.length;
        appendPiece(textNode, visibleEnd, length);
        checkExtensionDone();
      } else {
        done = true;
        closeParagraph();
      }
    }
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
 *
 * A sentence cut in half by the end of the page is extended past the page
 * boundary and emitted as one whole chunk with `pageEndCutIndex` marking
 * where the visible page ends inside its text (so read-aloud can turn the
 * page mid-utterance instead of stopping at the fragment).
 */
export function collectSpeechChunksFromRange(range: Range): BooksSpeechChunk[] {
  const chunks: BooksSpeechChunk[] = [];
  for (const paragraph of collectParagraphs(range)) {
    for (const segment of splitTextIntoSpeechSegments(paragraph.text)) {
      const raw = paragraph.text.slice(segment.start, segment.end);
      const text = raw.replace(/\s+/g, " ").trim();
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
        const chunk: BooksSpeechChunk = { text, range: chunkRange };
        const cut = paragraph.pageCutOffset;
        if (cut !== undefined && cut > segment.start && cut < segment.end) {
          // Map the paragraph cut offset into the normalized chunk text:
          // count the normalized length of the visible part.
          const visible = paragraph.text
            .slice(segment.start, cut)
            .replace(/\s+/g, " ")
            .replace(/^\s+/, "");
          const cutIndex = Math.min(visible.replace(/\s+$/, "").length, text.length);
          if (cutIndex > 0 && cutIndex < text.length) {
            chunk.pageEndCutIndex = cutIndex;
          }
        }
        chunks.push(chunk);
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

const OVERFLOW_CLIP_RE = /hidden|clip|auto|scroll/;

/**
 * Whether any part of the range is actually visible in the paginated reader.
 *
 * The CFI-derived page range can overshoot what is on screen (epub.js maps
 * locations asynchronously, and an unresolvable end boundary falls back to
 * the end of the section), which made read-aloud drift ahead of the visible
 * page. Layout geometry is authoritative: project the range's rect into the
 * embedding document and clip it against the scroll container that hides
 * off-page columns. Lenient (returns true) when geometry is unavailable,
 * e.g. outside an iframe or in non-layout DOM environments.
 */
export function isRangeOnVisiblePage(range: Range): boolean {
  const doc = range.startContainer.ownerDocument;
  const win = doc?.defaultView;
  const frame = win?.frameElement as HTMLElement | null | undefined;
  if (!doc || !win || !frame) return true;

  let rect: DOMRect;
  try {
    rect = range.getBoundingClientRect();
  } catch {
    return true;
  }
  // Zero-size rects carry no layout information — don't skip the chunk.
  if (rect.width === 0 && rect.height === 0) return true;

  const parentWin = frame.ownerDocument.defaultView;
  if (!parentWin || typeof parentWin.getComputedStyle !== "function") {
    return true;
  }

  // Range rect in the embedding document's coordinate space. (The epub.js
  // iframe spans the whole section; its container scrolls/clips per page.)
  const frameRect = frame.getBoundingClientRect();
  let left = frameRect.left + rect.left;
  let top = frameRect.top + rect.top;
  let right = left + rect.width;
  let bottom = top + rect.height;

  for (let el = frame.parentElement; el; el = el.parentElement) {
    let clips = false;
    try {
      const style = parentWin.getComputedStyle(el);
      clips = OVERFLOW_CLIP_RE.test(
        `${style.overflow} ${style.overflowX} ${style.overflowY}`
      );
    } catch {
      clips = false;
    }
    if (!clips) continue;
    const clipRect = el.getBoundingClientRect();
    left = Math.max(left, clipRect.left);
    top = Math.max(top, clipRect.top);
    right = Math.min(right, clipRect.right);
    bottom = Math.min(bottom, clipRect.bottom);
  }
  right = Math.min(right, parentWin.innerWidth);
  bottom = Math.min(bottom, parentWin.innerHeight);
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  return right - left > 1 && bottom - top > 1;
}

/**
 * Whether the end of the range (its last character) is on the visible page.
 * Used to detect a chunk whose sentence flows past the page boundary when
 * the page range itself couldn't be clipped (unresolvable end CFI). Lenient
 * (returns true) when the endpoint can't be probed.
 */
export function isRangeEndOnVisiblePage(range: Range): boolean {
  const { endContainer, endOffset } = range;
  if (endContainer.nodeType !== Node.TEXT_NODE || endOffset < 1) {
    return true;
  }
  const doc = endContainer.ownerDocument;
  if (!doc) return true;
  try {
    const probe = doc.createRange();
    probe.setStart(endContainer, endOffset - 1);
    probe.setEnd(endContainer, endOffset);
    return isRangeOnVisiblePage(probe);
  } catch {
    return true;
  }
}

/** One character's end-boundary within a range (for geometric page-cut search). */
interface CharProbe {
  node: Text;
  /** Exclusive end offset of this character in `node`. */
  endOffset: number;
  char: string;
}

function listCharProbesInRange(range: Range): CharProbe[] {
  const probes: CharProbe[] = [];
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  if (!root) return probes;
  const doc =
    root.nodeType === Node.DOCUMENT_NODE
      ? (root as Document)
      : root.ownerDocument;
  if (!doc) return probes;

  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    if (!isSpokenTextNode(textNode)) continue;
    const length = textNode.data.length;
    if (
      compareBoundaryPoints(textNode, length, range.startContainer, range.startOffset) <= 0
    ) {
      continue;
    }
    if (
      compareBoundaryPoints(textNode, 0, range.endContainer, range.endOffset) >= 0
    ) {
      break;
    }
    let start = 0;
    if (range.startContainer === textNode) start = range.startOffset;
    let end = length;
    if (range.endContainer === textNode) end = range.endOffset;
    for (let offset = start; offset < end; offset++) {
      probes.push({
        node: textNode,
        endOffset: offset + 1,
        char: textNode.data.charAt(offset),
      });
    }
  }
  return probes;
}

/**
 * When layout shows a chunk ending past the page but the page range didn't
 * clip it, find the offset into `chunk.text` where the visible page ends.
 * Returns undefined when every (or no) character appears on-screen.
 */
export function findPageEndCutIndexInChunk(
  chunk: BooksSpeechChunk
): number | undefined {
  if (isRangeEndOnVisiblePage(chunk.range)) return undefined;

  const probes = listCharProbesInRange(chunk.range);
  if (probes.length === 0) return undefined;

  // Binary-search the last character still on the visible page.
  let lo = 0;
  let hi = probes.length;
  const doc = chunk.range.startContainer.ownerDocument;
  if (!doc) return undefined;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const probe = probes[mid - 1];
    try {
      const charRange = doc.createRange();
      charRange.setStart(probe.node, probe.endOffset - 1);
      charRange.setEnd(probe.node, probe.endOffset);
      if (isRangeOnVisiblePage(charRange)) lo = mid;
      else hi = mid - 1;
    } catch {
      hi = mid - 1;
    }
  }
  if (lo <= 0 || lo >= probes.length) return undefined;

  // Map the visible raw prefix onto the normalized chunk text (same rules as
  // collectSpeechChunksFromRange's pageEndCutIndex mapping).
  const visibleRaw = probes
    .slice(0, lo)
    .map((probe) => probe.char)
    .join("");
  const visibleNorm = visibleRaw
    .replace(/\s+/g, " ")
    .replace(/^\s+/, "")
    .replace(/\s+$/, "");
  if (!visibleNorm) return undefined;
  if (chunk.text.startsWith(visibleNorm)) {
    return visibleNorm.length < chunk.text.length ? visibleNorm.length : undefined;
  }
  // Whitespace / ruby drift — take the shared prefix length.
  let shared = 0;
  const limit = Math.min(visibleNorm.length, chunk.text.length);
  while (shared < limit && visibleNorm[shared] === chunk.text[shared]) {
    shared += 1;
  }
  return shared > 0 && shared < chunk.text.length ? shared : undefined;
}

/** Apply a geometric page-cut marker when CFI range collection missed it. */
export function applyGeometricPageEndCut(chunk: BooksSpeechChunk): void {
  if (chunk.pageEndCutIndex !== undefined) return;
  if (isRangeEndOnVisiblePage(chunk.range)) return;
  const cutIndex = findPageEndCutIndexInChunk(chunk);
  if (cutIndex !== undefined) {
    chunk.pageEndCutIndex = cutIndex;
  }
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
