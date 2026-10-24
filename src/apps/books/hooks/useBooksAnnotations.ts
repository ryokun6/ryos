import { useCallback, useEffect, useRef, useState } from "react";
import type { Contents, Rendition } from "epubjs";
import { mergeTouchingHighlights } from "@/apps/books/utils/booksHighlightRanges";
import {
  BOOKS_HIGHLIGHT_COLOR_HEX,
  normalizeBooksHighlightColor,
  useBooksStore,
  type BookHighlight,
  type BooksHighlightColor,
} from "@/stores/useBooksStore";

/** CSS class applied to highlight annotation marks (epub.js SVG overlay). */
export const BOOKS_HIGHLIGHT_CLASS = "ryos-book-highlight";

/**
 * Injected into every section document so passages stay selectable on iOS:
 * some publisher stylesheets ship `user-select: none`, and WebKit needs
 * `-webkit-touch-callout` enabled for the long-press selection gesture.
 * (The parent-document side of the iOS fix lives on `.books-reader-selectable`
 * in index.css — WebKit also checks the iframe element's own styles.)
 */
export const BOOKS_SELECTION_CONTENT_CSS = `
html, body, body * {
  -webkit-user-select: text !important;
  user-select: text !important;
  -webkit-touch-callout: default !important;
}
`;

/** How long after a selectionchange the cleared-selection check runs. Kept
 * slightly above epub.js's own 250ms "selected" debounce so a clear never
 * races the selection event that preceded it. */
const SELECTION_CLEAR_DEBOUNCE_MS = 300;

/**
 * Pause after epub.js reports a settled selection before the highlight is
 * saved. Gives the selection toolbar time to appear, and lets a cleared or
 * revised selection cancel the mark. Matches the selection-clear debounce.
 */
export const HIGHLIGHT_APPLY_DELAY_MS = 300;

/** SVG attributes for a highlight mark; blend mode keeps the text readable on
 * both light (multiply darkens ink under the tint) and dark (screen lightens
 * the tint over the page) reading palettes. The active (tapped) highlight gets
 * a moderately stronger tint — kept low enough that the blended ink underneath
 * still reads (screen especially washes light text out fast). */
export function buildHighlightAnnotationStyles(
  color: BooksHighlightColor,
  isDarkPage: boolean,
  isActive = false
): Record<string, string> {
  const fillOpacity = isDarkPage
    ? isActive
      ? "0.55"
      : "0.45"
    : isActive
      ? "0.65"
      : "0.5";
  return {
    fill: BOOKS_HIGHLIGHT_COLOR_HEX[color],
    "fill-opacity": fillOpacity,
    "mix-blend-mode": isDarkPage ? "screen" : "multiply",
  };
}

/**
 * The passage the selection toolbar is acting on: either a fresh text
 * selection ("selection") or an existing saved highlight that was tapped
 * ("highlight").
 */
export interface BooksActiveSelection {
  kind: "selection" | "highlight";
  cfiRange: string;
  text: string;
  /** Set when kind === "highlight". */
  highlightId?: string;
  color?: BooksHighlightColor;
}

interface UseBooksAnnotationsOptions {
  getRendition: () => Rendition | null;
  /** True once the reader has displayed the book (rendition is stable). */
  isReady: boolean;
  /** Dark reading palette — drives the annotation blend mode. */
  isDarkPage: boolean;
  highlights: BookHighlight[];
  onAddHighlight: (highlight: BookHighlight) => void;
  onSetHighlightColor: (id: string, color: BooksHighlightColor) => void;
  onRemoveHighlight: (id: string) => void;
}

interface BooksAnnotationsApi {
  activeSelection: BooksActiveSelection | null;
  /** Apply (or re-color) a highlight for the active selection. */
  applyHighlightColor: (color: BooksHighlightColor) => void;
  /** Remove the active saved highlight (kind === "highlight" only). */
  removeActiveHighlight: () => void;
  /** Copy the active passage to the clipboard; resolves success. */
  copyActiveSelection: () => Promise<boolean>;
  /** Dismiss the toolbar and clear any in-document text selection. */
  clearActiveSelection: () => void;
}

function normalizeSelectionText(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function makeHighlightId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function readRangeText(
  rendition: Rendition | null,
  cfiRange: string
): string {
  if (!rendition) return "";
  try {
    return normalizeSelectionText(rendition.getRange(cfiRange)?.toString());
  } catch {
    return "";
  }
}

/** Fold the new passage into any highlight it touches, preferring DOM text. */
function highlightForSelection(
  existing: readonly BookHighlight[],
  cfiRange: string,
  text: string,
  color: BooksHighlightColor,
  rendition: Rendition | null
): BookHighlight {
  const incoming: BookHighlight = {
    id: makeHighlightId(),
    cfiRange,
    text,
    color,
    createdAt: Date.now(),
  };
  const merged =
    mergeTouchingHighlights([...existing, incoming], {
      preferredId: incoming.id,
    }).find((item) => item.id === incoming.id) ?? incoming;
  if (merged.cfiRange === incoming.cfiRange) return merged;
  const domText = readRangeText(rendition, merged.cfiRange);
  return domText ? { ...merged, text: domText } : merged;
}

/**
 * Text-selection + highlight annotations for the Books reader.
 *
 * Listens for epub.js `selected` events (text selected inside the section
 * iframe) and `markClicked` events (tap on an existing highlight), keeps the
 * rendition's SVG highlight marks in sync with the saved highlights, and
 * exposes the actions behind the selection toolbar (highlight color, copy).
 *
 * A settled text selection is committed in the last-used highlight color
 * (reader setting `lastHighlightColor`) after a short pause, so the next
 * passage does not require another swatch tap. The pause is cancelled when
 * the selection is cleared or revised. Tapping a swatch applies that color
 * immediately, recolors the highlight, and becomes the new default.
 * Overlapping or contiguous highlights on the same passage collapse into one
 * range in the color being applied.
 */
export function useBooksAnnotations({
  getRendition,
  isReady,
  isDarkPage,
  highlights,
  onAddHighlight,
  onSetHighlightColor,
  onRemoveHighlight,
}: UseBooksAnnotationsOptions): BooksAnnotationsApi {
  const [activeSelection, setActiveSelection] =
    useState<BooksActiveSelection | null>(null);
  const activeSelectionRef = useRef(activeSelection);
  activeSelectionRef.current = activeSelection;

  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;
  const getRenditionRef = useRef(getRendition);
  getRenditionRef.current = getRendition;

  const lastHighlightColor = normalizeBooksHighlightColor(
    useBooksStore((state) => state.settings.lastHighlightColor)
  );
  const lastHighlightColorRef = useRef(lastHighlightColor);
  lastHighlightColorRef.current = lastHighlightColor;

  const onAddHighlightRef = useRef(onAddHighlight);
  onAddHighlightRef.current = onAddHighlight;

  // Highlight just committed from a selection, before the saved list prop
  // catches up. Stops a second `selected` for the same range from inserting
  // another id.
  const pendingHighlightRef = useRef<BookHighlight | null>(null);
  const pendingApplyTimerRef = useRef<number | null>(null);
  const pendingApplyRef = useRef<{ cfiRange: string; text: string } | null>(
    null
  );

  const cancelPendingHighlightApply = useCallback(() => {
    if (pendingApplyTimerRef.current !== null) {
      window.clearTimeout(pendingApplyTimerRef.current);
      pendingApplyTimerRef.current = null;
    }
    pendingApplyRef.current = null;
  }, []);

  // cfiRanges currently registered on the rendition, so re-syncs (highlight
  // list or palette change) can remove exactly what was added.
  const registeredCfiRangesRef = useRef<string[]>([]);

  const clearDocumentSelections = useCallback(() => {
    const rendition = getRendition();
    if (!rendition) return;
    const renditionContents = rendition.getContents() as unknown;
    const contentsList = (
      Array.isArray(renditionContents)
        ? renditionContents
        : renditionContents
          ? [renditionContents]
          : []
    ) as Contents[];
    for (const contents of contentsList) {
      try {
        contents.window?.getSelection()?.removeAllRanges();
      } catch {
        // ignore
      }
    }
  }, [getRendition]);

  const clearDocumentSelectionsRef = useRef(clearDocumentSelections);
  clearDocumentSelectionsRef.current = clearDocumentSelections;

  // Selection tracking: epub.js emits `selected` (debounced selectionchange)
  // with the selection's CFI range; clearing is detected with our own
  // per-document selectionchange listener (epub.js stays silent on collapse).
  // `getRendition` is read through a ref so an inline callback identity change
  // does not restart the effect and cancel a highlight that is still waiting.
  useEffect(() => {
    if (!isReady) return;
    const rendition = getRenditionRef.current();
    if (!rendition) return;

    let disposed = false;
    let clearTimer: number | null = null;
    const docsWithListener = new WeakSet<Document>();
    const cleanups: Array<() => void> = [];

    const commitSelection = (cfiRange: string, text: string) => {
      const saved =
        highlightsRef.current.find(
          (highlight) => highlight.cfiRange === cfiRange
        ) ??
        (pendingHighlightRef.current?.cfiRange === cfiRange
          ? pendingHighlightRef.current
          : undefined);
      if (saved) {
        const next = {
          kind: "highlight" as const,
          cfiRange: saved.cfiRange,
          text: saved.text || text,
          highlightId: saved.id,
          color: saved.color,
        };
        activeSelectionRef.current = next;
        setActiveSelection(next);
        clearDocumentSelectionsRef.current();
        return;
      }

      const highlight = highlightForSelection(
        highlightsRef.current,
        cfiRange,
        text,
        lastHighlightColorRef.current,
        rendition
      );
      pendingHighlightRef.current = highlight;
      onAddHighlightRef.current(highlight);
      // Clear the pending-apply token before dropping the native selection.
      // removeAllRanges fires selectionchange, which must not cancel a commit
      // that has already landed or dismiss the saved-highlight toolbar.
      pendingApplyRef.current = null;
      const next = {
        kind: "highlight" as const,
        cfiRange: highlight.cfiRange,
        text: highlight.text,
        highlightId: highlight.id,
        color: highlight.color,
      };
      activeSelectionRef.current = next;
      setActiveSelection(next);
      clearDocumentSelectionsRef.current();
    };

    const scheduleHighlightApply = (
      cfiRange: string,
      text: string,
      contents: Contents
    ) => {
      cancelPendingHighlightApply();
      pendingApplyRef.current = { cfiRange, text };
      pendingApplyTimerRef.current = window.setTimeout(() => {
        pendingApplyTimerRef.current = null;
        const expected = pendingApplyRef.current;
        if (
          disposed ||
          !expected ||
          expected.cfiRange !== cfiRange ||
          expected.text !== text
        ) {
          return;
        }
        const active = activeSelectionRef.current;
        if (
          !active ||
          active.kind !== "selection" ||
          active.cfiRange !== cfiRange ||
          active.text !== text
        ) {
          return;
        }
        let liveText = "";
        let collapsed = true;
        try {
          const selection = contents.window?.getSelection();
          collapsed =
            !selection || selection.rangeCount === 0 || selection.isCollapsed;
          liveText = normalizeSelectionText(selection?.toString());
        } catch {
          return;
        }
        if (collapsed || liveText !== text) return;
        pendingApplyRef.current = null;
        commitSelection(cfiRange, text);
      }, HIGHLIGHT_APPLY_DELAY_MS);
    };

    const handleSelected = (cfiRange: string, contents: Contents) => {
      if (disposed) return;
      let text = "";
      try {
        text = normalizeSelectionText(
          contents.window?.getSelection()?.toString()
        );
      } catch {
        text = "";
      }
      if (!text) {
        text = readRangeText(rendition, cfiRange);
      }
      if (!text) return;

      const saved =
        highlightsRef.current.find(
          (highlight) => highlight.cfiRange === cfiRange
        ) ??
        (pendingHighlightRef.current?.cfiRange === cfiRange
          ? pendingHighlightRef.current
          : undefined);
      if (saved) {
        cancelPendingHighlightApply();
        // Reselecting a passage that is already highlighted opens it. The
        // stored color wins; this is not a new default.
        const next = {
          kind: "highlight" as const,
          cfiRange: saved.cfiRange,
          text: saved.text || text,
          highlightId: saved.id,
          color: saved.color,
        };
        activeSelectionRef.current = next;
        setActiveSelection(next);
        clearDocumentSelectionsRef.current();
        return;
      }

      // Show the toolbar immediately, but wait before saving the mark so a
      // selection that is still moving can be cancelled.
      const next = {
        kind: "selection" as const,
        cfiRange,
        text,
        color: lastHighlightColorRef.current,
      };
      activeSelectionRef.current = next;
      setActiveSelection(next);
      scheduleHighlightApply(cfiRange, text, contents);
    };

    const handleMarkClicked = (
      cfiRange: string,
      data: { id?: string } | undefined
    ) => {
      if (disposed) return;
      const list = highlightsRef.current;
      const highlight =
        (data?.id ? list.find((h) => h.id === data.id) : undefined) ??
        list.find((h) => h.cfiRange === cfiRange);
      if (!highlight) return;
      setActiveSelection({
        kind: "highlight",
        cfiRange: highlight.cfiRange,
        text: highlight.text,
        highlightId: highlight.id,
        color: highlight.color,
      });
    };

    const attachSelectionClearListener = (contents: Contents) => {
      const doc = contents.document;
      const win = contents.window;
      if (!doc || !win || docsWithListener.has(doc)) return;
      docsWithListener.add(doc);
      const onSelectionChange = () => {
        let collapsed = true;
        let liveText = "";
        try {
          const selection = win.getSelection();
          collapsed =
            !selection || selection.rangeCount === 0 || selection.isCollapsed;
          liveText = normalizeSelectionText(selection?.toString());
        } catch {
          collapsed = true;
        }
        const pending = pendingApplyRef.current;
        if (
          pending &&
          (collapsed || liveText !== pending.text)
        ) {
          // Don't wait for the clear debounce: the apply timer is the same
          // length and would otherwise save a selection that already moved.
          cancelPendingHighlightApply();
        }
        if (clearTimer !== null) window.clearTimeout(clearTimer);
        clearTimer = window.setTimeout(() => {
          clearTimer = null;
          if (disposed) return;
          let stillCollapsed = true;
          try {
            const selection = win.getSelection();
            stillCollapsed =
              !selection || selection.rangeCount === 0 || selection.isCollapsed;
          } catch {
            stillCollapsed = true;
          }
          if (stillCollapsed) {
            // Only fresh selections follow the document selection; a tapped
            // highlight has no live selection backing it.
            setActiveSelection((prev) =>
              prev?.kind === "selection" ? null : prev
            );
          }
        }, SELECTION_CLEAR_DEBOUNCE_MS);
      };
      doc.addEventListener("selectionchange", onSelectionChange);
      cleanups.push(() =>
        doc.removeEventListener("selectionchange", onSelectionChange)
      );

      // A tapped highlight has no live selection, so selectionchange never
      // clears it. Any press on the page itself (highlight marks live in the
      // parent overlay and intercept their own clicks) dismisses the toolbar.
      const onPointerDown = () => {
        setActiveSelection((prev) =>
          prev?.kind === "highlight" ? null : prev
        );
      };
      doc.addEventListener("pointerdown", onPointerDown);
      cleanups.push(() =>
        doc.removeEventListener("pointerdown", onPointerDown)
      );
    };

    const attachToCurrentContents = () => {
      const renditionContents = rendition.getContents() as unknown;
      const contentsList = (
        Array.isArray(renditionContents)
          ? renditionContents
          : renditionContents
            ? [renditionContents]
            : []
      ) as Contents[];
      contentsList.forEach(attachSelectionClearListener);
    };

    const handleRendered = () => attachToCurrentContents();

    rendition.on("selected", handleSelected);
    rendition.on("markClicked", handleMarkClicked);
    rendition.on("rendered", handleRendered);
    attachToCurrentContents();

    return () => {
      disposed = true;
      cancelPendingHighlightApply();
      if (clearTimer !== null) window.clearTimeout(clearTimer);
      cleanups.forEach((cleanup) => cleanup());
      try {
        rendition.off("selected", handleSelected);
        rendition.off("markClicked", handleMarkClicked);
        rendition.off("rendered", handleRendered);
      } catch {
        // rendition may already be destroyed
      }
    };
  }, [cancelPendingHighlightApply, isReady]);

  // Once the saved list includes the highlight we just inserted, the list
  // itself dedupes a repeat selection of that range.
  useEffect(() => {
    const pending = pendingHighlightRef.current;
    if (!pending) return;
    if (highlights.some((highlight) => highlight.id === pending.id)) {
      pendingHighlightRef.current = null;
    }
  }, [highlights]);

  // Keep the rendition's highlight marks in sync with the saved highlights
  // (re-tinted when the palette flips light/dark, and brightened while a
  // highlight is the active/tapped one).
  const activeHighlightId =
    activeSelection?.kind === "highlight" ? activeSelection.highlightId : null;
  useEffect(() => {
    if (!isReady) return;
    const rendition = getRendition();
    if (!rendition) return;

    for (const cfiRange of registeredCfiRangesRef.current) {
      try {
        rendition.annotations.remove(cfiRange, "highlight");
      } catch {
        // ignore
      }
    }
    registeredCfiRangesRef.current = [];

    for (const highlight of highlights) {
      try {
        rendition.annotations.highlight(
          highlight.cfiRange,
          { id: highlight.id },
          undefined,
          BOOKS_HIGHLIGHT_CLASS,
          buildHighlightAnnotationStyles(
            highlight.color,
            isDarkPage,
            highlight.id === activeHighlightId
          )
        );
        registeredCfiRangesRef.current.push(highlight.cfiRange);
      } catch {
        // Skip highlights whose CFI can't be resolved in this book build.
      }
    }
  }, [getRendition, isReady, highlights, isDarkPage, activeHighlightId]);

  // Reset transient selection state when the book changes/unmounts.
  useEffect(
    () => () => {
      cancelPendingHighlightApply();
      registeredCfiRangesRef.current = [];
      setActiveSelection(null);
    },
    [cancelPendingHighlightApply]
  );

  const clearActiveSelection = useCallback(() => {
    cancelPendingHighlightApply();
    clearDocumentSelections();
    setActiveSelection(null);
  }, [cancelPendingHighlightApply, clearDocumentSelections]);

  // Store updates must stay OUT of setActiveSelection updaters: React runs
  // updaters during render (updating the parent mid-render) and StrictMode
  // invokes them twice, which double-added highlights with distinct ids.
  const applyHighlightColor = useCallback(
    (color: BooksHighlightColor) => {
      cancelPendingHighlightApply();
      const active = activeSelection;
      if (!active) return;
      const stored = normalizeBooksHighlightColor(
        useBooksStore.getState().settings.lastHighlightColor
      );
      if (stored !== color) {
        useBooksStore.getState().updateSettings({ lastHighlightColor: color });
      }
      if (active.kind === "highlight" && active.highlightId) {
        onSetHighlightColor(active.highlightId, color);
      } else {
        const highlight = highlightForSelection(
          highlightsRef.current,
          active.cfiRange,
          active.text,
          color,
          getRendition()
        );
        pendingHighlightRef.current = highlight;
        onAddHighlight(highlight);
      }
      setActiveSelection(null);
      clearDocumentSelections();
    },
    [
      activeSelection,
      cancelPendingHighlightApply,
      clearDocumentSelections,
      getRendition,
      onAddHighlight,
      onSetHighlightColor,
    ]
  );

  const removeActiveHighlight = useCallback(() => {
    cancelPendingHighlightApply();
    const active = activeSelection;
    if (active?.kind === "highlight" && active.highlightId) {
      if (pendingHighlightRef.current?.id === active.highlightId) {
        pendingHighlightRef.current = null;
      }
      onRemoveHighlight(active.highlightId);
    }
    setActiveSelection(null);
    clearDocumentSelections();
  }, [
    activeSelection,
    cancelPendingHighlightApply,
    clearDocumentSelections,
    onRemoveHighlight,
  ]);

  const copyActiveSelection = useCallback(async (): Promise<boolean> => {
    const text = activeSelection?.text;
    if (!text) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, [activeSelection]);

  return {
    activeSelection,
    applyHighlightColor,
    removeActiveHighlight,
    copyActiveSelection,
    clearActiveSelection,
  };
}
