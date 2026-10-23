/**
 * Slice an extracted webFetch document into one model page.
 * Feeds move by whole items. Prose moves on a paragraph, heading, or sentence.
 */

import {
  WEB_FETCH_PAGE_CHARS,
  WEB_FETCH_PAGE_HARD_MAX,
  WEB_FETCH_PAGE_ITEMS,
  WEB_FETCH_PAGE_MIN,
} from "./webContentLimits.js";

export interface WebFetchPagination {
  unit: "chars" | "items";
  total: number;
  /** Start of this page. Character offset, or feed item index. */
  offset: number;
  /** Exclusive end in the same unit. Equal to nextOffset when another page exists. */
  end: number;
  /** Chunk within a feed item that is longer than the page. 0 when the item is whole. */
  part: number;
  hasMore: boolean;
  /** Pass this back as `offset`. Null on the last page. */
  nextOffset: number | null;
  /** Pass this back as `part` when a feed item continues. Otherwise null. */
  nextPart: number | null;
  pageChars: number;
}

export interface WebFetchPage {
  content: string;
  truncated: boolean;
  outOfRange: boolean;
  pagination: WebFetchPagination;
}

export interface PageableWebDocument {
  text: string;
  sourceTruncated?: boolean;
  feedHeader?: string;
  feedBlocks?: string[];
  feedItemCount?: number;
  matchedFeedItem?: boolean;
}

export interface WebFetchPageRequest {
  offset?: number;
  part?: number;
  maxChars?: number;
}

const FEED_ITEM_SEPARATOR = "\n\n---\n\n";

function finiteInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.floor(value);
}

export function clampPageChars(value: number | undefined): number {
  const requested = finiteInt(value);
  if (requested == null) return WEB_FETCH_PAGE_CHARS;
  return Math.min(Math.max(requested, WEB_FETCH_PAGE_MIN), WEB_FETCH_PAGE_HARD_MAX);
}

function emptyPagination(
  unit: "chars" | "items",
  total: number,
  offset: number
): WebFetchPagination {
  return {
    unit,
    total,
    offset,
    end: offset,
    part: 0,
    hasMore: false,
    nextOffset: null,
    nextPart: null,
    pageChars: 0,
  };
}

function joinFeedPage(header: string, blocks: string[]): string {
  const body = blocks.filter(Boolean).join(FEED_ITEM_SEPARATOR);
  if (header && body) return `${header}\n\n${body}`;
  return header || body;
}

/** Exclusive end index inside `window`, or -1 when nothing safe is found. */
function findProseBreak(window: string, minKeep: number): number {
  let best = -1;
  const start = Math.max(0, minKeep);
  for (let i = start; i < window.length - 1; i++) {
    if (window[i] === "\n" && window[i + 1] === "\n") best = i;
    else if (window[i] === "\n" && window[i + 1] === "#") best = i + 1;
  }
  if (best >= start) return best;
  for (let i = window.length - 1; i > start; i--) {
    const prev = window[i - 1];
    const cur = window[i];
    if (
      (prev === "." || prev === "!" || prev === "?" || prev === "。") &&
      (cur === " " || cur === "\n")
    ) {
      return i;
    }
  }
  return -1;
}

function findJsonBreak(window: string, minKeep: number): number {
  let best = -1;
  for (let i = Math.max(0, minKeep); i < window.length; i++) {
    const cur = window[i];
    if (cur === "\n" || cur === "}" || cur === "]") best = i + 1;
  }
  return best;
}

function fenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith("```", i) && (i === 0 || text[i - 1] === "\n")) {
      if (open < 0) {
        open = i;
      } else {
        const lineEnd = text.indexOf("\n", i);
        const end = lineEnd < 0 ? text.length : lineEnd + 1;
        spans.push({ start: open, end });
        open = -1;
        i = end - 1;
      }
    }
  }
  if (open >= 0) spans.push({ start: open, end: text.length });
  return spans;
}

function chooseEnd(
  text: string,
  offset: number,
  maxChars: number,
  mode: "prose" | "json"
): number {
  const hard = Math.min(text.length, offset + maxChars);
  if (hard >= text.length) return text.length;
  const min = offset + Math.min(400, Math.floor((hard - offset) * 0.45));
  const window = text.slice(offset, hard);
  const rel =
    mode === "json" ? findJsonBreak(window, min - offset) : findProseBreak(window, min - offset);
  let end = rel > 0 ? offset + rel : hard;
  if (mode === "prose") {
    const span = fenceSpans(text).find((item) => end > item.start && end < item.end);
    if (span) {
      if (span.end <= offset + maxChars && span.end > offset) end = span.end;
      else if (span.start > offset && span.start >= min) end = span.start;
    }
  }
  return end > offset ? end : hard;
}

function nextContentIndex(text: string, index: number): number {
  let next = index;
  while (next < text.length && text[next] === "\n") next += 1;
  return next;
}

function startsClean(text: string, offset: number): boolean {
  if (offset <= 0) return true;
  if (text[offset] === "#") return true;
  let i = offset - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\n")) i -= 1;
  if (i < 0) return true;
  const prev = text[i];
  return prev === "." || prev === "!" || prev === "?" || prev === "。" || prev === "\n";
}

function pageNote(input: {
  hasMore: boolean;
  sourceTruncated: boolean;
  unit: "chars" | "items";
  offset: number;
  end: number;
  total: number;
  part: number;
  nextOffset: number | null;
  nextPart: number | null;
  storedItems?: number;
  reportedItems?: number;
}): string {
  const parts: string[] = [];
  if (input.hasMore && input.nextOffset != null) {
    const range =
      input.nextPart != null
        ? `item ${input.offset} part ${input.part}`
        : input.unit === "items"
          ? input.end === input.offset + 1
            ? `item ${input.offset} of ${input.total}`
            : `items ${input.offset}–${Math.max(input.offset, input.end - 1)} of ${input.total}`
          : `chars ${input.offset}–${input.end} of ${input.total}`;
    const next =
      input.nextPart != null
        ? `call webfetch again with offset ${input.nextOffset} and part ${input.nextPart}`
        : `call webfetch again with offset ${input.nextOffset}`;
    parts.push(`${range}. ${next}`);
  }
  if (
    input.sourceTruncated &&
    !input.hasMore &&
    input.reportedItems != null &&
    input.storedItems != null &&
    input.reportedItems > input.storedItems
  ) {
    parts.push(`source cut – ${input.storedItems} of ${input.reportedItems} posts`);
  } else if (input.sourceTruncated && !input.hasMore) {
    parts.push(
      input.unit === "items"
        ? `source cut at ${input.total} items`
        : `source cut at ${input.total} chars`
    );
  }
  if (parts.length === 0) return "";
  return `\n\n[truncated – ${parts.join(". ")}]`;
}

function finishPage(
  content: string,
  pagination: WebFetchPagination,
  sourceTruncated: boolean,
  extra?: { storedItems?: number; reportedItems?: number }
): WebFetchPage {
  const note = pageNote({
    hasMore: pagination.hasMore,
    sourceTruncated,
    unit: pagination.unit,
    offset: pagination.offset,
    end: pagination.end,
    total: pagination.total,
    part: pagination.part,
    nextOffset: pagination.nextOffset,
    nextPart: pagination.nextPart,
    storedItems: extra?.storedItems,
    reportedItems: extra?.reportedItems,
  });
  const withNote = note ? `${content.trimEnd()}${note}` : content.trim();
  return {
    content: withNote,
    truncated: pagination.hasMore || (sourceTruncated && !pagination.hasMore && note.length > 0),
    outOfRange: false,
    pagination: { ...pagination, pageChars: content.trim().length },
  };
}

function pagePlain(
  text: string,
  requested: number,
  maxChars: number,
  sourceTruncated: boolean,
  mode: "prose" | "json"
): WebFetchPage {
  const total = text.length;
  if (total === 0) {
    return finishPage("", emptyPagination("chars", 0, 0), sourceTruncated);
  }
  if (requested >= total) {
    return {
      content: "",
      truncated: false,
      outOfRange: true,
      pagination: emptyPagination("chars", total, requested),
    };
  }

  let offset = requested;
  if (offset > 0 && !startsClean(text, offset)) {
    const back = text.lastIndexOf("\n\n", offset);
    if (back >= 0 && offset - (back + 2) <= 600) {
      offset = nextContentIndex(text, back + 2);
    }
  }

  const end = chooseEnd(text, offset, maxChars, mode);
  const next = nextContentIndex(text, end);
  const hasMore = next < text.length;
  const content = text.slice(offset, end).trim();
  return finishPage(
    content,
    {
      unit: "chars",
      total,
      offset,
      end: next,
      part: 0,
      hasMore,
      nextOffset: hasMore ? next : null,
      nextPart: null,
      pageChars: content.length,
    },
    sourceTruncated
  );
}

function chunkItem(item: string, maxChars: number): string[] {
  if (item.length <= maxChars) return [item];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < item.length && chunks.length < 40) {
    const remaining = item.length - cursor;
    if (remaining <= maxChars) {
      const tail = item.slice(cursor).trim();
      if (tail) chunks.push(tail);
      break;
    }
    const window = item.slice(cursor, cursor + maxChars);
    const minKeep = Math.min(400, Math.floor(maxChars * 0.4));
    let rel = findProseBreak(window, minKeep);
    if (rel <= 0) rel = maxChars;
    let next = cursor + rel;
    const piece = item.slice(cursor, next).trim();
    if (!piece) {
      next = Math.min(item.length, cursor + Math.max(1, maxChars));
      chunks.push(item.slice(cursor, next));
    } else {
      chunks.push(piece);
      next = nextContentIndex(item, next);
    }
    if (next <= cursor) next = cursor + 1;
    cursor = next;
  }
  return chunks.length > 0 ? chunks : [item.slice(0, maxChars)];
}

function pageFeed(
  doc: PageableWebDocument,
  requestedOffset: number,
  requestedPart: number,
  maxChars: number
): WebFetchPage {
  const blocks = doc.feedBlocks ?? [];
  const stored = blocks.length;
  const reported = doc.feedItemCount ?? stored;
  const total = Math.max(reported, stored);
  const sourceTruncated = doc.sourceTruncated === true || reported > stored;
  const header = doc.feedHeader ?? "";

  if (stored === 0) {
    return finishPage(
      header,
      {
        unit: "items",
        total,
        offset: 0,
        end: 0,
        part: 0,
        hasMore: false,
        nextOffset: null,
        nextPart: null,
        pageChars: header.length,
      },
      sourceTruncated,
      { storedItems: stored, reportedItems: reported }
    );
  }

  if (requestedOffset >= stored) {
    return {
      content: "",
      truncated: false,
      outOfRange: true,
      pagination: emptyPagination("items", total, requestedOffset),
    };
  }

  let offset = requestedOffset;
  let part = Math.max(0, requestedPart);
  let chunks = chunkItem(blocks[offset] ?? "", maxChars);
  if (part >= chunks.length) {
    offset += 1;
    part = 0;
    if (offset >= stored) {
      return {
        content: "",
        truncated: false,
        outOfRange: true,
        pagination: emptyPagination("items", total, requestedOffset),
      };
    }
    chunks = chunkItem(blocks[offset] ?? "", maxChars);
  }

  if (chunks.length > 1) {
    const continued = part > 0 ? `[continued – item ${offset} part ${part}]\n\n` : "";
    const content = joinFeedPage(header, [`${continued}${chunks[part]}`]);
    const moreParts = part + 1 < chunks.length;
    const nextOffset = moreParts ? offset : offset + 1;
    const hasMore = moreParts || nextOffset < stored;
    return finishPage(
      content,
      {
        unit: "items",
        total,
        offset,
        end: moreParts ? offset : nextOffset,
        part,
        hasMore,
        nextOffset: hasMore ? nextOffset : null,
        nextPart: moreParts ? part + 1 : null,
        pageChars: content.length,
      },
      sourceTruncated,
      { storedItems: stored, reportedItems: reported }
    );
  }

  const taken: string[] = [blocks[offset] ?? ""];
  let nextIndex = offset + 1;
  while (nextIndex < stored && taken.length < WEB_FETCH_PAGE_ITEMS) {
    const upcoming = chunkItem(blocks[nextIndex] ?? "", maxChars);
    if (upcoming.length > 1) break;
    const candidate = joinFeedPage(header, [...taken, blocks[nextIndex] ?? ""]);
    if (candidate.length > maxChars) break;
    taken.push(blocks[nextIndex] ?? "");
    nextIndex += 1;
  }

  const content = joinFeedPage(header, taken);
  const hasMore = nextIndex < stored;
  return finishPage(
    content,
    {
      unit: "items",
      total,
      offset,
      end: nextIndex,
      part: 0,
      hasMore,
      nextOffset: hasMore ? nextIndex : null,
      nextPart: null,
      pageChars: content.length,
    },
    sourceTruncated,
    { storedItems: stored, reportedItems: reported }
  );
}

export function describeWebFetchPage(
  doc: { title?: string; siteName?: string; finalUrl: string },
  page: WebFetchPage
): string {
  const hostname = (() => {
    try {
      return new URL(doc.finalUrl).hostname;
    } catch {
      return doc.finalUrl;
    }
  })();
  const siteName = doc.siteName || hostname;
  const info = page.pagination;
  if (page.outOfRange) {
    const unitLabel =
      info.unit === "items" ? (info.total === 1 ? "item" : "items") : info.total === 1 ? "char" : "chars";
    return `offset ${info.offset} is past the end – ${info.total} ${unitLabel}`;
  }
  const next = info.hasMore
    ? info.nextPart != null
      ? `, next offset ${info.nextOffset} part ${info.nextPart}`
      : `, next offset ${info.nextOffset}`
    : "";
  const itemRange =
    info.end <= info.offset + 1
      ? `item ${info.offset} of ${info.total}`
      : `items ${info.offset}–${info.end - 1} of ${info.total}`;
  const range =
    info.unit === "items"
      ? `${itemRange}${next}`
      : `chars ${info.offset}–${info.end} of ${info.total}${next}`;
  const titled = doc.title ? `: "${doc.title}"` : "";
  const lead =
    info.unit === "items"
      ? `Fetched feed from ${siteName}${titled}`
      : `Fetched and extracted content from ${siteName}${titled}`;
  return `${lead} (${range})`;
}

export function pageWebDocument(
  doc: PageableWebDocument,
  request: WebFetchPageRequest = {}
): WebFetchPage {
  const maxChars = clampPageChars(request.maxChars);
  const offset = Math.max(0, finiteInt(request.offset) ?? 0);
  const part = Math.max(0, finiteInt(request.part) ?? 0);
  const feed = !doc.matchedFeedItem && (doc.feedBlocks?.length || doc.feedHeader);
  if (feed) return pageFeed(doc, offset, part, maxChars);
  const mode = doc.text.trimStart().startsWith("{") || doc.text.trimStart().startsWith("[")
    ? "json"
    : "prose";
  return pagePlain(doc.text, offset, maxChars, doc.sourceTruncated === true, mode);
}
