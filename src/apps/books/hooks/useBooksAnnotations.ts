import { useCallback, useEffect, useRef, useState } from "react";
import type { Contents, Rendition } from "epubjs";
import {
  BOOKS_HIGHLIGHT_COLOR_HEX,
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

/**
 * Text-selection + highlight annotations for the Books reader.
 *
 * Listens for epub.js `selected` events (text selected inside the section
 * iframe) and `markClicked` events (tap on an existing highlight), keeps the
 * rendition's SVG highlight marks in sync with the saved highlights, and
 * exposes the actions behind the selection toolbar (highlight color, copy).
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

  const highlightsRef = useRef(highlights);
  highlightsRef.current = highlights;

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

  // Selection tracking: epub.js emits `selected` (debounced selectionchange)
  // with the selection's CFI range; clearing is detected with our own
  // per-document selectionchange listener (epub.js stays silent on collapse).
  useEffect(() => {
    if (!isReady) return;
    const rendition = getRendition();
    if (!rendition) return;

    let disposed = false;
    let clearTimer: number | null = null;
    const docsWithListener = new WeakSet<Document>();
    const cleanups: Array<() => void> = [];

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
        try {
          text = normalizeSelectionText(
            rendition.getRange(cfiRange)?.toString()
          );
        } catch {
          text = "";
        }
      }
      if (!text) return;
      setActiveSelection({ kind: "selection", cfiRange, text });
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
        if (clearTimer !== null) window.clearTimeout(clearTimer);
        clearTimer = window.setTimeout(() => {
          clearTimer = null;
          if (disposed) return;
          let collapsed = true;
          try {
            const selection = win.getSelection();
            collapsed =
              !selection ||
              selection.rangeCount === 0 ||
              selection.isCollapsed;
          } catch {
            collapsed = true;
          }
          if (collapsed) {
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
  }, [getRendition, isReady]);

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
      registeredCfiRangesRef.current = [];
      setActiveSelection(null);
    },
    []
  );

  const clearActiveSelection = useCallback(() => {
    clearDocumentSelections();
    setActiveSelection(null);
  }, [clearDocumentSelections]);

  // Store updates must stay OUT of setActiveSelection updaters: React runs
  // updaters during render (updating the parent mid-render) and StrictMode
  // invokes them twice, which double-added highlights with distinct ids.
  const applyHighlightColor = useCallback(
    (color: BooksHighlightColor) => {
      const active = activeSelection;
      if (!active) return;
      if (active.kind === "highlight" && active.highlightId) {
        onSetHighlightColor(active.highlightId, color);
      } else {
        onAddHighlight({
          id: makeHighlightId(),
          cfiRange: active.cfiRange,
          text: active.text,
          color,
          createdAt: Date.now(),
        });
      }
      setActiveSelection(null);
      clearDocumentSelections();
    },
    [
      activeSelection,
      clearDocumentSelections,
      onAddHighlight,
      onSetHighlightColor,
    ]
  );

  const removeActiveHighlight = useCallback(() => {
    const active = activeSelection;
    if (active?.kind === "highlight" && active.highlightId) {
      onRemoveHighlight(active.highlightId);
    }
    setActiveSelection(null);
  }, [activeSelection, onRemoveHighlight]);

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
