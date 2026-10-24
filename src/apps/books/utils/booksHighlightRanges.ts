import type { BooksHighlightColor } from "@/stores/useBooksStore";
// Subpath, not the `epubjs` package entry. Books cover tests replace that
// entry with a mock for the rest of the process; a named or default import
// from it then has no CFI parser.
import EpubCfiModule from "epubjs/src/epubcfi.js";

/**
 * A saved Books highlight, minus the book path. Overlapping or contiguous
 * ranges on the same spine collapse into one mark so annotations don't stack.
 */
export interface MergeableHighlight {
  id: string;
  cfiRange: string;
  text: string;
  color: BooksHighlightColor;
  createdAt: number;
}

export interface HighlightMergeOptions {
  /**
   * Highlight the user is creating or recoloring. Its id is kept, and its
   * color paints the whole merged range.
   */
  preferredId?: string;
  /**
   * Ids that just arrived from another device. When several of them fall in
   * one cluster, the newest one keeps its id and color; the others are folded
   * in and dropped.
   */
  preferredIds?: ReadonlySet<string>;
}

interface CfiStep {
  id?: string;
  type?: string;
  index: number;
}

interface CfiTerminal {
  offset: number | null;
  assertion?: string | null;
}

interface CfiSegment {
  steps: CfiStep[];
  terminal: CfiTerminal;
}

interface ParsedCfi {
  range: boolean;
  spinePos: number;
  base: { steps: CfiStep[] };
  path: CfiSegment;
  start: CfiSegment | null;
  end: CfiSegment | null;
  compare(a: unknown, b: unknown): number;
  equalStep(a: object, b: object): boolean;
  collapse(toStart?: boolean): void;
  toString(): string;
}

const EpubCFI = EpubCfiModule as unknown as new (cfi?: string) => ParsedCfi;

function parseCfi(cfi: string): ParsedCfi | null {
  if (!cfi.startsWith("epubcfi(")) return null;
  try {
    return new EpubCFI(cfi);
  } catch {
    return null;
  }
}

function stepsEqual(cfi: ParsedCfi, a: CfiStep[], b: CfiStep[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!cfi.equalStep(a[i], b[i])) return false;
  }
  return true;
}

function sameSpine(a: ParsedCfi, b: ParsedCfi): boolean {
  return a.spinePos === b.spinePos && stepsEqual(a, a.base.steps, b.base.steps);
}

function collapsedPoint(cfi: string, toStart: boolean): ParsedCfi | null {
  const parsed = parseCfi(cfi);
  if (!parsed) return null;
  if (parsed.range) parsed.collapse(toStart);
  if (parsed.range) return null;
  return parsed;
}

/** True when `cfi` is an EPUB CFI range epub.js can parse. */
export function isHighlightRangeCfi(cfi: string): boolean {
  const parsed = parseCfi(cfi);
  return Boolean(parsed?.range && parsed.start && parsed.end);
}

/**
 * True when two highlight ranges overlap or touch (half-open: the end offset
 * of one equals the start offset of the next). A gap of one character does
 * not count. Different spine items never merge.
 */
export function highlightRangesTouch(a: string, b: string): boolean {
  if (a === b) return true;
  const left = parseCfi(a);
  const right = parseCfi(b);
  if (!left?.range || !right?.range || !left.start || !left.end || !right.start || !right.end) {
    return false;
  }
  if (!sameSpine(left, right)) return false;
  const startA = collapsedPoint(a, true);
  const endA = collapsedPoint(a, false);
  const startB = collapsedPoint(b, true);
  const endB = collapsedPoint(b, false);
  if (!startA || !endA || !startB || !endB) return false;
  // [start, end) ranges touch when each starts at or before the other ends.
  return left.compare(startA, endB) <= 0 && left.compare(startB, endA) <= 0;
}

function unionCfi(a: string, b: string): string | null {
  if (!highlightRangesTouch(a, b)) return null;
  if (a === b) return a;
  const startA = collapsedPoint(a, true);
  const endA = collapsedPoint(a, false);
  const startB = collapsedPoint(b, true);
  const endB = collapsedPoint(b, false);
  const probe = parseCfi(a);
  if (!startA || !endA || !startB || !endB || !probe) return null;

  const start = probe.compare(startA, startB) <= 0 ? startA : startB;
  const end = probe.compare(endA, endB) >= 0 ? endA : endB;
  const startSteps = start.path.steps;
  const endSteps = end.path.steps;
  let prefix = 0;
  while (
    prefix < startSteps.length &&
    prefix < endSteps.length &&
    probe.equalStep(startSteps[prefix], endSteps[prefix])
  ) {
    prefix += 1;
  }
  let pathSteps = startSteps.slice(0, prefix);
  let startSide = startSteps.slice(prefix);
  let endSide = endSteps.slice(prefix);
  // Offsets on one text node: keep that step on both sides so the range
  // string matches the shape epub.js emits (`…/2,/1:0,/1:12`).
  if (startSide.length === 0 && endSide.length === 0 && pathSteps.length > 0) {
    const shared = pathSteps[pathSteps.length - 1];
    pathSteps = pathSteps.slice(0, -1);
    startSide = [shared];
    endSide = [shared];
  }

  const union = parseCfi(a);
  if (!union) return null;
  union.range = true;
  union.path = { steps: pathSteps, terminal: { offset: null, assertion: null } };
  union.start = { steps: startSide, terminal: { ...start.path.terminal } };
  union.end = { steps: endSide, terminal: { ...end.path.terminal } };
  try {
    const serialized = union.toString();
    return parseCfi(serialized)?.range ? serialized : null;
  } catch {
    return null;
  }
}

function nodeKey(point: ParsedCfi): string {
  const steps = point.path.steps
    .map((step) => `${step.type ?? ""}:${step.index}:${step.id ?? ""}`)
    .join("/");
  return `${point.spinePos}|${steps}`;
}

function sameNodeSpan(
  cfi: string
): { node: string; start: number; end: number } | null {
  const start = collapsedPoint(cfi, true);
  const end = collapsedPoint(cfi, false);
  if (!start || !end || !stepsEqual(start, start.path.steps, end.path.steps)) {
    return null;
  }
  const startOffset = start.path.terminal?.offset;
  const endOffset = end.path.terminal?.offset;
  if (typeof startOffset !== "number" || typeof endOffset !== "number") return null;
  return { node: nodeKey(start), start: startOffset, end: endOffset };
}

function stitchSameNode(
  parts: Array<{ start: number; end: number; text: string }>
): string | null {
  const sorted = parts.toSorted((a, b) => a.start - b.start || a.end - b.end);
  if (sorted.length === 0) return null;
  let cursor = sorted[0].start;
  let out = "";
  for (const part of sorted) {
    if (part.end <= cursor) continue;
    const skip = Math.max(0, cursor - part.start);
    const rawLength = part.end - part.start;
    if (skip > 0 && part.text.length !== rawLength) return null;
    if (skip > part.text.length) return null;
    out += part.text.slice(skip);
    cursor = part.end;
  }
  const text = out.replace(/\s+/g, " ").trim();
  return text || null;
}

function highlightText(
  cluster: readonly MergeableHighlight[],
  union: string,
  preferredId: string | undefined
): string {
  const exact =
    cluster.find((item) => item.id === preferredId && item.cfiRange === union) ??
    cluster.find((item) => item.cfiRange === union);
  if (exact?.text) return exact.text;

  const spans = cluster.map((item) => ({
    item,
    span: sameNodeSpan(item.cfiRange),
  }));
  const first = spans[0]?.span;
  if (first && spans.every((entry) => entry.span?.node === first.node && entry.span)) {
    const stitched = stitchSameNode(
      spans.map((entry) => ({
        start: entry.span!.start,
        end: entry.span!.end,
        text: entry.item.text,
      }))
    );
    if (stitched) return stitched;
  }

  const ordered = cluster.toSorted((a, b) => {
    const startA = collapsedPoint(a.cfiRange, true);
    const startB = collapsedPoint(b.cfiRange, true);
    if (!startA || !startB) return 0;
    return startA.compare(startA, startB);
  });
  return ordered
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function newest(items: readonly MergeableHighlight[]): MergeableHighlight {
  return items.reduce((best, item) =>
    item.createdAt > best.createdAt ||
    (item.createdAt === best.createdAt && item.id > best.id)
      ? item
      : best
  );
}

function earliest(items: readonly MergeableHighlight[]): MergeableHighlight {
  return items.reduce((best, item) =>
    item.createdAt < best.createdAt ||
    (item.createdAt === best.createdAt && item.id < best.id)
      ? item
      : best
  );
}

function collapseCluster<T extends MergeableHighlight>(
  cluster: readonly T[],
  options: HighlightMergeOptions
): T[] {
  if (cluster.length <= 1) return [...cluster];

  let union = cluster[0].cfiRange;
  for (const item of cluster.slice(1)) {
    const next = unionCfi(union, item.cfiRange);
    if (!next) return [...cluster];
    union = next;
  }

  const preferredMembers = cluster.filter((item) =>
    options.preferredId
      ? item.id === options.preferredId
      : options.preferredIds?.has(item.id)
  );
  const kept = options.preferredId && preferredMembers.length > 0
    ? preferredMembers[0]
    : preferredMembers.length > 0
      ? newest(preferredMembers)
      : earliest(cluster);
  const color =
    options.preferredId && preferredMembers.some((item) => item.id === options.preferredId)
      ? preferredMembers[0].color
      : preferredMembers.length > 0
        ? newest(preferredMembers).color
        : newest(cluster).color;

  const merged = {
    ...kept,
    id: kept.id,
    cfiRange: union,
    text: highlightText(cluster, union, kept.id),
    color,
    createdAt: earliest(cluster).createdAt,
  } as T;
  return [merged];
}

/**
 * Collapse every chain of touching highlights into one range. Untouched marks
 * stay in their original order; a merged mark occupies the position of the
 * earliest member of its cluster.
 */
export function mergeTouchingHighlights<T extends MergeableHighlight>(
  highlights: readonly T[],
  options: HighlightMergeOptions = {}
): T[] {
  const consumed = new Set<number>();
  const merged: T[] = [];
  for (let i = 0; i < highlights.length; i++) {
    if (consumed.has(i)) continue;
    const clusterIndexes = [i];
    consumed.add(i);
    let grew = true;
    while (grew) {
      grew = false;
      for (let j = 0; j < highlights.length; j++) {
        if (consumed.has(j)) continue;
        const touches = clusterIndexes.some((index) =>
          highlightRangesTouch(highlights[index].cfiRange, highlights[j].cfiRange)
        );
        if (!touches) continue;
        consumed.add(j);
        clusterIndexes.push(j);
        grew = true;
      }
    }
    merged.push(
      ...collapseCluster(
        clusterIndexes.map((index) => highlights[index]),
        options
      )
    );
  }
  return merged;
}
