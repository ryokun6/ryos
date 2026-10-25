/**
 * Reading progress for the page the reader is actually looking at.
 *
 * epub.js paginated mode turns pages by scrolling a section-wide iframe, and
 * `relocated` often reports the section start (or a chapter percentage)
 * rather than the column on screen. The visible page — probed from the
 * clip rectangle — is the location that sync and resume should restore.
 */

export interface PageRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type PageProgressDirection = "ltr" | "rtl";

const PROBE_INSET_PX = 28;

/**
 * A point on the visible page, in iframe-viewport coordinates.
 * LTR reads from the left edge of the clip; RTL and vertical-rl from the right.
 * Returns null when the frame and the clip do not overlap.
 */
export function visiblePageProbeInFrame(
  frame: PageRect,
  clip: PageRect,
  direction: PageProgressDirection,
  inset = PROBE_INSET_PX
): { x: number; y: number } | null {
  const left = Math.max(frame.left, clip.left);
  const top = Math.max(frame.top, clip.top);
  const right = Math.min(frame.right, clip.right);
  const bottom = Math.min(frame.bottom, clip.bottom);
  if (right - left < 8 || bottom - top < 8) return null;

  const yInParent = Math.min(bottom - 4, top + inset);
  const xInParent =
    direction === "rtl"
      ? Math.max(left + 4, right - inset)
      : Math.min(right - 4, left + inset);

  return {
    x: xInParent - frame.left,
    y: yInParent - frame.top,
  };
}

/** Extra probes down the page when the leading edge is margin or a figure. */
export function visiblePageProbeCandidates(
  frame: PageRect,
  clip: PageRect,
  direction: PageProgressDirection
): { x: number; y: number }[] {
  const primary = visiblePageProbeInFrame(frame, clip, direction);
  if (!primary) return [];
  const points = [primary];
  const maxY = Math.min(frame.bottom, clip.bottom) - frame.top - 4;
  for (const dy of [40, 88]) {
    const y = primary.y + dy;
    if (y < maxY) points.push({ x: primary.x, y });
  }
  return points;
}

export interface SyncedPageProgressInput {
  /** CFI from epub.js `relocated` / `currentLocation`. May be the section start. */
  reportedCfi?: string | null;
  /** CFI of the text actually inside the visible page clip. */
  visibleCfi?: string | null;
  /**
   * True when `reportedCfi` already lies on the page in the clip. A page
   * flip's report is often the section start, which has scrolled away; a
   * reopen's report is the saved place and is on screen. Keeping that
   * on-screen CFI stops every reopen from advancing by the probe inset.
   */
  reportedOnVisiblePage?: boolean;
  /** 0..1 from the relocated event, often missing or chapter-scoped. */
  reportedPercentage?: number | null;
  /** 0..1 from `locations.percentageFromCfi` for the chosen CFI. */
  locationsPercentage?: number | null;
  atStart?: boolean;
  /** Last known-good percentage, kept until a real scale is available. */
  seededPercentage?: number;
}

export interface SyncedPageProgress {
  cfi: string;
  percentage: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Prefer the visible-page CFI. Percentage comes from generated locations
 * for that CFI, then from a relocated percentage that is actually non-zero
 * (or a real book start), then from the seeded value so a 0 from a missing
 * location map cannot wipe a known place.
 */
export function resolveSyncedPageProgress(
  input: SyncedPageProgressInput
): SyncedPageProgress | null {
  const visible = input.visibleCfi?.trim() ?? "";
  const reported = input.reportedCfi?.trim() ?? "";
  // The last page flip probes the column on screen. Once that CFI is what
  // the reader is showing, later relocates keep it instead of sampling a
  // point inset from the edge (which would creep forward on every reopen).
  const cfi =
    reported && input.reportedOnVisiblePage ? reported : visible || reported;
  if (!cfi) return null;

  const locations = input.locationsPercentage;
  if (
    typeof locations === "number" &&
    Number.isFinite(locations) &&
    (locations > 0 || input.atStart)
  ) {
    return { cfi, percentage: clamp01(locations) };
  }

  const reportedPct = input.reportedPercentage;
  if (
    typeof reportedPct === "number" &&
    Number.isFinite(reportedPct) &&
    (reportedPct > 0 || input.atStart)
  ) {
    return { cfi, percentage: clamp01(reportedPct) };
  }

  return {
    cfi,
    percentage: clamp01(input.seededPercentage ?? 0),
  };
}

export interface ReadingProgressSnapshot {
  cfi: string;
  percentage: number;
  kosyncProgress?: string;
}

/** True when a new sample would not move the synced place. */
export function isSameReadingProgress(
  existing: ReadingProgressSnapshot | undefined,
  next: ReadingProgressSnapshot
): boolean {
  if (!existing) return false;
  if (existing.cfi !== next.cfi) return false;
  if ((existing.kosyncProgress ?? "") !== (next.kosyncProgress ?? "")) {
    return false;
  }
  return Math.abs(existing.percentage - next.percentage) < 0.0005;
}

const OVERFLOW_CLIP_RE = /hidden|clip|auto|scroll/;

/** Intersection of overflow-clipping ancestors, in the parent viewport. */
export function clipRectForFrame(frame: HTMLElement): PageRect {
  const parentWin = frame.ownerDocument.defaultView;
  const frameRect = frame.getBoundingClientRect();
  let bounds: PageRect = {
    left: 0,
    top: 0,
    right: parentWin?.innerWidth ?? frameRect.right,
    bottom: parentWin?.innerHeight ?? frameRect.bottom,
  };
  if (!parentWin || typeof parentWin.getComputedStyle !== "function") {
    return frameRect;
  }
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
    const rect = el.getBoundingClientRect();
    bounds = {
      left: Math.max(bounds.left, rect.left),
      top: Math.max(bounds.top, rect.top),
      right: Math.min(bounds.right, rect.right),
      bottom: Math.min(bounds.bottom, rect.bottom),
    };
  }
  return bounds;
}

interface CaretPointDocument {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (
    x: number,
    y: number
  ) => { offsetNode: Node; offset: number } | null;
  createRange: () => Range;
}

interface PageContents {
  document?: Document;
  window?: Window;
  cfiFromRange?: (range: Range) => string;
}

export interface VisiblePageRendition {
  getContents?: () => unknown;
  settings?: { direction?: string; defaultDirection?: string };
}

function listContents(rendition: VisiblePageRendition): PageContents[] {
  const raw = rendition.getContents?.() as unknown;
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]) as PageContents[];
}

function caretRangeAt(doc: Document, x: number, y: number): Range | null {
  const caretDoc = doc as Document & CaretPointDocument;
  try {
    const fromPoint = caretDoc.caretRangeFromPoint?.(x, y);
    if (fromPoint && fromPoint.startContainer) return fromPoint;
  } catch {
    // try the position API
  }
  try {
    const pos = caretDoc.caretPositionFromPoint?.(x, y);
    if (!pos?.offsetNode) return null;
    const range = caretDoc.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  } catch {
    return null;
  }
}

/**
 * Whether `range` (coordinates inside the section iframe) meets the visible
 * page clip. False when layout geometry is missing — an off-screen section
 * start must not count as the page the reader is on.
 */
export function rangeIntersectsVisiblePage(
  range: Range,
  frame: HTMLElement
): boolean {
  let rect: DOMRect;
  try {
    rect = range.getBoundingClientRect();
  } catch {
    return false;
  }
  if (rect.width === 0 && rect.height === 0) return false;
  const frameRect = frame.getBoundingClientRect();
  const clip = clipRectForFrame(frame);
  const left = frameRect.left + rect.left;
  const top = frameRect.top + rect.top;
  const right = left + rect.width;
  const bottom = top + rect.height;
  const overlapW = Math.min(right, clip.right) - Math.max(left, clip.left);
  const overlapH = Math.min(bottom, clip.bottom) - Math.max(top, clip.top);
  return overlapW > 1 && overlapH > 1;
}

export interface ReportedCfiRendition extends VisiblePageRendition {
  getRange?: (cfi: string) => Range | null | undefined;
}

/** True when the CFI epub.js reported is already inside the visible page. */
export function reportedCfiOnVisiblePage(
  rendition: ReportedCfiRendition,
  cfi: string
): boolean {
  const trimmed = cfi.trim();
  if (!trimmed || typeof rendition.getRange !== "function") return false;
  let range: Range | null = null;
  try {
    range = rendition.getRange(trimmed) ?? null;
  } catch {
    return false;
  }
  if (!range?.startContainer) return false;
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement;
  if (!(frame instanceof HTMLElement)) return false;
  return rangeIntersectsVisiblePage(range, frame);
}

function pageDirection(rendition: VisiblePageRendition): PageProgressDirection {
  const direction =
    rendition.settings?.direction ?? rendition.settings?.defaultDirection;
  return direction === "rtl" ? "rtl" : "ltr";
}

/**
 * EPUB CFI for the text at the leading edge of the visible page.
 * Null when the section has not laid out or no caret can be resolved.
 */
export function readVisiblePageCfi(
  rendition: VisiblePageRendition
): string | null {
  const direction = pageDirection(rendition);
  for (const contents of listContents(rendition)) {
    const doc = contents.document;
    const frame = contents.window?.frameElement;
    if (!doc || !(frame instanceof HTMLElement)) continue;
    if (typeof contents.cfiFromRange !== "function") continue;
    const frameRect = frame.getBoundingClientRect();
    if (frameRect.width < 8 || frameRect.height < 8) continue;
    const clip = clipRectForFrame(frame);
    for (const point of visiblePageProbeCandidates(frameRect, clip, direction)) {
      const range = caretRangeAt(doc, point.x, point.y);
      if (!range) continue;
      try {
        const cfi = contents.cfiFromRange(range);
        if (typeof cfi === "string" && cfi.startsWith("epubcfi(")) return cfi;
      } catch {
        // try the next probe
      }
    }
  }
  return null;
}
