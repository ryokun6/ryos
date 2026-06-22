import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import ePub, { type Book, type Rendition } from "epubjs";
import { cn } from "@/lib/utils";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { readBookBlobContent } from "@/services/vfs/FileContentRepository";
import type { BooksReaderSettings } from "@/stores/useBooksStore";
import {
  buildEpubTheme,
  buildFontFaceCss,
  columnModeToSpread,
  resolveReadingPalette,
} from "../utils/booksReader";
import { useBookCover } from "../utils/useBookCover";
import { BookCover } from "./BookCover";
import type { BooksLibraryEntry } from "../hooks/useBooksLogic";

interface BooksReaderPaneProps {
  entry: BooksLibraryEntry;
  settings: BooksReaderSettings;
  osIsDark: boolean;
  initialCfi?: string;
  onProgress: (cfi: string, percentage: number) => void;
}

interface FlipState {
  dir: "next" | "prev";
  id: number;
}

// Extra top clearance so the page never sits under the auto-hiding window
// title bar (the window uses the full-bleed "notitlebar" material).
const TOP_CLEARANCE = 36;
// Footer that holds the reading-progress bar.
const FOOTER_HEIGHT = 30;

export function BooksReaderPane({
  entry,
  settings,
  osIsDark,
  initialCfi,
  onProgress,
}: BooksReaderPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderHostRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const flipLockRef = useRef(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const initialCfiRef = useRef(initialCfi);

  const [isReady, setIsReady] = useState(false);
  const [coverVisible, setCoverVisible] = useState(true);
  const [flip, setFlip] = useState<FlipState | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [progressPct, setProgressPct] = useState(0);

  const { info: coverInfo, loading: coverLoading } = useBookCover(
    entry.path,
    entry.modifiedAt
  );

  const palette = resolveReadingPalette(settings.themeOverride, osIsDark);

  // Create the book + rendition for the active EPUB.
  useEffect(() => {
    let cancelled = false;
    let book: Book | null = null;
    let rendition: Rendition | null = null;
    setIsReady(false);
    setCoverVisible(true);

    const nextFrame = () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );

    const cleanupInstance = () => {
      try {
        rendition?.destroy();
      } catch {
        // ignore
      }
      try {
        book?.destroy();
      } catch {
        // ignore
      }
      if (renditionRef.current === rendition) renditionRef.current = null;
      if (bookRef.current === book) bookRef.current = null;
      rendition = null;
      book = null;
    };

    (async () => {
      try {
        const blob = await readBookBlobContent(entry.path);
        if (cancelled || !blob) return;
        const buffer = await blob.arrayBuffer();
        if (cancelled) return;

        const host = renderHostRef.current;
        if (!host) return;
        // Wait until the host has a measurable size so epub.js can lay out.
        for (let i = 0; i < 40 && host.clientHeight < 2; i++) {
          await nextFrame();
          if (cancelled) return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        book = ePub(buffer as any);
        bookRef.current = book;

        rendition = book.renderTo(host, {
          width: host.clientWidth || "100%",
          height: host.clientHeight || "100%",
          flow: "paginated",
          spread: columnModeToSpread(settings.columnMode),
          manager: "default",
        });
        renditionRef.current = rendition;

        const fontFaceCss = buildFontFaceCss(window.location.origin);
        rendition.hooks.content.register(
          (contents: {
            addStylesheetCss: (css: string, key: string) => void;
          }) => {
            try {
              contents.addStylesheetCss(fontFaceCss, "ryos-book-fonts");
            } catch {
              // ignore
            }
          }
        );

        rendition.themes.default(buildEpubTheme(settings, palette));
        rendition.themes.fontSize(`${settings.fontSizePct}%`);

        const activeBook = book;
        rendition.on(
          "relocated",
          (location: {
            start?: { cfi?: string; percentage?: number };
            atStart?: boolean;
            atEnd?: boolean;
          }) => {
            const cfi = location?.start?.cfi;
            setAtStart(!!location?.atStart);
            setAtEnd(!!location?.atEnd);
            if (!cfi) return;
            let pct = location?.start?.percentage ?? 0;
            try {
              const total = activeBook.locations?.length?.() ?? 0;
              if ((!pct || pct === 0) && total > 0) {
                pct = activeBook.locations.percentageFromCfi(cfi);
              }
            } catch {
              // ignore
            }
            setProgressPct(Math.min(1, Math.max(0, pct || 0)));
            onProgressRef.current(cfi, pct || 0);
          }
        );

        rendition.on("keyup", (event: KeyboardEvent) => handleKey(event));

        try {
          await rendition.display(initialCfiRef.current || undefined);
        } catch (err) {
          if (!cancelled) console.error("[Books] Failed to display book", err);
        }
        if (cancelled) {
          cleanupInstance();
          return;
        }
        setIsReady(true);
        // Reveal the page shortly after the zoom-in cover settles.
        window.setTimeout(() => {
          if (!cancelled) setCoverVisible(false);
        }, 420);

        // Generate locations for accurate progress percentages (best-effort).
        activeBook.ready
          .then(() => activeBook.locations.generate(1600))
          .catch(() => undefined);
      } catch (err) {
        if (!cancelled) console.error("[Books] Failed to open book", err);
      }
    })();

    return () => {
      cancelled = true;
      cleanupInstance();
    };
    // Only re-create when the book changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.path]);

  // Apply theme (colors, font family, line height) live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    renditionRef.current.themes.default(buildEpubTheme(settings, palette));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isReady,
    settings.fontId,
    settings.themeOverride,
    settings.lineHeight,
    osIsDark,
  ]);

  // Apply font size live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    renditionRef.current.themes.fontSize(`${settings.fontSizePct}%`);
  }, [isReady, settings.fontSizePct]);

  // Apply column/spread mode live.
  useEffect(() => {
    if (!isReady || !renditionRef.current) return;
    try {
      renditionRef.current.spread(columnModeToSpread(settings.columnMode));
    } catch {
      // ignore
    }
  }, [isReady, settings.columnMode]);

  // Keep the rendition sized to the render host (which is inset below the top
  // clearance and above the progress footer).
  useResizeObserverWithRef(
    renderHostRef,
    (resizeEntry) => {
      const rendition = renditionRef.current;
      if (!rendition) return;
      const { width, height } = resizeEntry.contentRect;
      if (width > 0 && height > 0) {
        try {
          rendition.resize(width, height);
        } catch {
          // ignore
        }
      }
    },
    { debounce: 80 }
  );

  const turnPage = useCallback((dir: "next" | "prev") => {
    const rendition = renditionRef.current;
    if (!rendition || flipLockRef.current) return;
    flipLockRef.current = true;
    setFlip({ dir, id: Date.now() });
    const action = dir === "next" ? rendition.next() : rendition.prev();
    Promise.resolve(action).finally(() => {
      // flip animation onComplete releases the lock
    });
  }, []);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        turnPage("next");
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        turnPage("prev");
      }
    },
    [turnPage]
  );

  // Window-level keyboard navigation (in addition to the iframe keyup).
  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowRight" ||
        e.key === "ArrowLeft" ||
        e.key === "PageDown" ||
        e.key === "PageUp"
      ) {
        e.preventDefault();
        handleKey(e);
      }
    };
    host.addEventListener("keydown", onKeyDown);
    return () => host.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      className="relative h-full w-full overflow-hidden outline-none"
      style={{ backgroundColor: palette.background }}
    >
      {/* The epub.js render target, inset below the top clearance and above
          the progress footer. */}
      <div
        ref={renderHostRef}
        className="absolute left-0 right-0"
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
      />

      {/* Click zones for page turning (aligned with the render host) */}
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => turnPage("prev")}
        disabled={atStart}
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
        className="absolute left-0 z-10 w-[22%] cursor-w-resize disabled:cursor-default"
      />
      <button
        type="button"
        aria-label="Next page"
        onClick={() => turnPage("next")}
        disabled={atEnd}
        style={{ top: TOP_CLEARANCE, bottom: FOOTER_HEIGHT }}
        className="absolute right-0 z-10 w-[22%] cursor-e-resize disabled:cursor-default"
      />

      {/* Reading-progress footer */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 px-4"
        style={{ height: FOOTER_HEIGHT }}
      >
        <div
          className={cn(
            "h-[3px] flex-1 overflow-hidden rounded-full",
            palette.isDark ? "bg-white/15" : "bg-black/10"
          )}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${Math.round(progressPct * 100)}%`,
              backgroundColor: palette.isDark
                ? "rgba(255,255,255,0.7)"
                : "rgba(0,0,0,0.55)",
            }}
          />
        </div>
        <span
          className={cn(
            "shrink-0 font-os-ui text-[10px] tabular-nums",
            palette.isDark ? "text-white/65" : "text-black/55"
          )}
        >
          {Math.round(progressPct * 100)}%
        </span>
      </div>

      {/* Page-turn flip animation */}
      <AnimatePresence
        onExitComplete={() => {
          flipLockRef.current = false;
        }}
      >
        {flip && (
          <motion.div
            key={flip.id}
            className="pointer-events-none absolute inset-0 z-20"
            style={{ perspective: 1600 }}
          >
            <motion.div
              className="absolute inset-0"
              style={{
                transformOrigin:
                  flip.dir === "next" ? "left center" : "right center",
                backgroundImage:
                  flip.dir === "next"
                    ? "linear-gradient(to left, rgba(0,0,0,0.18), rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.04))"
                    : "linear-gradient(to right, rgba(0,0,0,0.18), rgba(255,255,255,0.04) 40%, rgba(0,0,0,0.04))",
                backgroundColor: palette.background,
                boxShadow:
                  flip.dir === "next"
                    ? "-12px 0 24px rgba(0,0,0,0.25)"
                    : "12px 0 24px rgba(0,0,0,0.25)",
              }}
              initial={{ rotateY: 0 }}
              animate={{ rotateY: flip.dir === "next" ? -105 : 105 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.33, 0, 0.2, 1] }}
              onAnimationComplete={() => setFlip(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zoom-in cover overlay (shares layoutId with the shelf book) */}
      <AnimatePresence>
        {coverVisible && (
          <motion.div
            layoutId={`bookcover-${entry.path}`}
            className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
            exit={{ opacity: 0 }}
            transition={{
              layout: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
              opacity: { duration: 0.35 },
            }}
          >
            <BookCover
              title={entry.name}
              fileName={entry.fileName}
              info={coverInfo}
              loading={coverLoading}
              large
            />
          </motion.div>
        )}
      </AnimatePresence>

      {!isReady && (
        <div
          className={cn(
            "absolute inset-0 z-40 flex items-center justify-center",
            palette.isDark ? "text-white/70" : "text-black/50"
          )}
          style={{ backgroundColor: palette.background }}
        >
          <span className="font-os-ui text-sm">…</span>
        </div>
      )}
    </div>
  );
}
