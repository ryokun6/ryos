import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { motion } from "motion/react";
import type { BooksReaderSettings } from "@/stores/useBooksStore";
import { resolveReadingPalette } from "../utils/booksReader";
import { useBookCover } from "../utils/useBookCover";
import { BookCover } from "./BookCover";
import { ZOOM_DURATION, ZOOM_EASE } from "./BooksReaderPane";
import type {
  BooksLibraryEntry,
  BookOriginRect,
} from "../hooks/useBooksLogic";

// Escape a value for safe use inside a double-quoted attribute selector
// (only backslash and double-quote can break the selector string).
const cssEscape = (value: string): string =>
  value.replace(/(["\\])/g, "\\$1");

interface BookCloseZoomProps {
  entry: BooksLibraryEntry;
  /** The Books window content box; the overlay is absolutely placed within it. */
  containerRef: RefObject<HTMLDivElement | null>;
  settings: BooksReaderSettings;
  osIsDark: boolean;
  onDone: () => void;
}

/**
 * Transient overlay that mirrors the open zoom in reverse: a full-bleed cover
 * shrinks back down onto the destination book in the (freshly mounted) shelf,
 * then clears so the real shelf book is revealed underneath. Rendered above the
 * shelf in BooksAppComponent so it survives the reader -> shelf swap.
 */
export function BookCloseZoom({
  entry,
  containerRef,
  settings,
  osIsDark,
  onDone,
}: BookCloseZoomProps) {
  const palette = resolveReadingPalette(settings.themeOverride, osIsDark);
  const { info: coverInfo, loading: coverLoading } = useBookCover(
    entry.path,
    entry.modifiedAt
  );

  const [full, setFull] = useState<BookOriginRect | null>(null);
  const [target, setTarget] = useState<BookOriginRect | null>(null);
  const [ready, setReady] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  // Measure full-bleed synchronously (before paint, so the overlay covers the
  // shelf with no flash), then resolve the destination book's rect once the
  // freshly-mounted shelf has genuinely settled.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      finish();
      return;
    }
    const cRect = container.getBoundingClientRect();
    setFull({ top: 0, left: 0, width: cRect.width, height: cRect.height });

    let raf = 0;

    // The destination cover element (grid: the ShelfBook button; list: the
    // BookListRow cover box) — the exact same box the open zoom measured.
    const findBook = (): HTMLElement | null =>
      container.querySelector<HTMLElement>(
        `[data-book-path="${cssEscape(entry.path)}"]`
      );

    const scroller = (): HTMLElement =>
      container.querySelector<HTMLElement>("[data-books-scroll]") ?? container;

    // Land on the book only when a solid majority of it is visible inside the
    // scroll viewport; otherwise fall back to a clean fade (never fly to an
    // off-screen / edge position).
    const visibleEnough = (rect: DOMRect, viewport: DOMRect): boolean => {
      const visW =
        Math.min(rect.right, viewport.right) -
        Math.max(rect.left, viewport.left);
      const visH =
        Math.min(rect.bottom, viewport.bottom) -
        Math.max(rect.top, viewport.top);
      if (visW <= 0 || visH <= 0) return false;
      const area = rect.width * rect.height;
      return area > 0 && (visW * visH) / area >= 0.5;
    };

    const commit = (rect: DOMRect | null) => {
      const c = containerRef.current;
      if (c && rect && rect.width > 0 && rect.height > 0) {
        const containerRect = c.getBoundingClientRect();
        const viewport = scroller().getBoundingClientRect();
        if (visibleEnough(rect, viewport)) {
          setTarget({
            top: rect.top - containerRect.top,
            left: rect.left - containerRect.left,
            width: rect.width,
            height: rect.height,
          });
        }
      }
      // target stays null when not visible enough -> fade fallback.
      setReady(true);
    };

    // Bring the destination book into view by scrolling ONLY its own scroll
    // container (never ancestors / the window), so the close zoom can land on it
    // even though the remounted shelf resets to scrollTop 0.
    const scrollIntoView = (el: HTMLElement) => {
      const sc = scroller();
      if (sc === container) return;
      const er = el.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      const margin = 12;
      if (er.top < sr.top + margin) {
        sc.scrollTop -= sr.top + margin - er.top;
      } else if (er.bottom > sr.bottom - margin) {
        sc.scrollTop += er.bottom - (sr.bottom - margin);
      }
    };

    // Frame budget + how many consecutive identical frames count as "settled".
    const MAX_FRAMES = 40;
    const REQUIRED_STABLE = 3;
    let frames = 0;
    let stableCount = 0;
    let prev: DOMRect | null = null;
    let didScroll = false;

    const rectsClose = (a: DOMRect, b: DOMRect): boolean =>
      Math.abs(a.top - b.top) < 0.5 &&
      Math.abs(a.left - b.left) < 0.5 &&
      Math.abs(a.width - b.width) < 0.5 &&
      Math.abs(a.height - b.height) < 0.5;

    const tick = () => {
      const c = containerRef.current;
      if (!c) {
        finish();
        return;
      }
      frames += 1;
      const containerRect = c.getBoundingClientRect();
      const el = findBook();
      const rect = el?.getBoundingClientRect() ?? null;

      // Wait for the container to have a sane size and the book to exist.
      if (containerRect.width < 1 || containerRect.height < 1 || !rect) {
        if (frames < MAX_FRAMES) {
          raf = requestAnimationFrame(tick);
        } else {
          commit(null); // never appeared -> fade
        }
        return;
      }

      const stable = !!prev && rectsClose(rect, prev);
      stableCount = stable ? stableCount + 1 : 0;
      prev = rect;

      // Require several consecutive identical frames so we never commit on an
      // intermediate layout (e.g. the grid's brief 1-per-row pre-reflow state,
      // or list rows shifting as covers/metadata load in above).
      if (stableCount < REQUIRED_STABLE) {
        if (frames < MAX_FRAMES) {
          raf = requestAnimationFrame(tick);
        } else {
          // Couldn't confirm a settled layout -> fade rather than risk a miss.
          commit(null);
        }
        return;
      }

      // Settled. Scroll the book into view once, then re-measure next frame.
      if (el && !didScroll) {
        didScroll = true;
        scrollIntoView(el);
        prev = null;
        stableCount = 0;
        raf = requestAnimationFrame(tick);
        return;
      }

      commit(rect);
    };

    raf = requestAnimationFrame(tick);

    // Backstop so a missed animation callback can never strand the overlay.
    const safety = window.setTimeout(finish, ZOOM_DURATION * 1000 + 1200);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.path]);

  if (!full) return null;

  const fullVals = {
    top: full.top,
    left: full.left,
    width: full.width,
    height: full.height,
    borderRadius: 0,
  };
  const animateVals = !ready
    ? fullVals
    : target
      ? {
          top: target.top,
          left: target.left,
          width: target.width,
          height: target.height,
          borderRadius: 4,
        }
      : { ...fullVals, opacity: 0 };

  return (
    <motion.div
      className="pointer-events-none absolute z-50 overflow-hidden"
      style={{ backgroundColor: palette.background }}
      initial={false}
      animate={animateVals}
      transition={
        ready && !target
          ? { duration: 0.3 }
          : { duration: ZOOM_DURATION, ease: ZOOM_EASE }
      }
      onAnimationComplete={() => {
        if (ready) finish();
      }}
    >
      <BookCover
        title={entry.name}
        fileName={entry.fileName}
        info={coverInfo}
        loading={coverLoading}
        large
        fit="contain"
      />
    </motion.div>
  );
}
