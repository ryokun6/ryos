import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGroup, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Plus, SquaresFour, Rows } from "@phosphor-icons/react";
import {
  ToolbarButton,
  ToolbarButtonGroup,
} from "@/components/ui/toolbar-button";
import { RightClickMenu, type MenuItem } from "@/components/ui/right-click-menu";
import { usePointerLongPress } from "@/hooks/usePointerLongPress";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type {
  BooksLibraryEntry,
  BookOriginRect,
} from "../hooks/useBooksLogic";
import type { BookProgress, BooksShelfView } from "@/stores/useBooksStore";
import { ShelfBook, BookMorphCover } from "./ShelfBook";
import { useBookCover } from "../utils/useBookCover";

interface BooksShelfViewProps {
  library: BooksLibraryEntry[];
  progressByPath: Record<string, BookProgress>;
  shelfView: BooksShelfView;
  onSetShelfView: (view: BooksShelfView) => void;
  onOpenBook: (entry: BooksLibraryEntry, originRect?: BookOriginRect) => void;
  onImport: () => void;
  onDeleteBook: (entry: BooksLibraryEntry) => void;
  onMoveToTop: (path: string) => void;
  onMoveToBottom: (path: string) => void;
}

interface ShelfContextMenu {
  entry: BooksLibraryEntry;
  x: number;
  y: number;
}

const BOOK_COVER_WIDTH = 104; // standing cover width (matches ShelfBook)
const BOOK_GAP = 20; // horizontal gap between books (gap-5)
// Left/right gutter. Books are left-aligned; the fit math below counts no
// trailing gap so a book isn't forced to wrap just to reserve one.
const SHELF_GUTTER = 32;

// Books slot (168) with -6px ledge overlap + ledge (12+14+16). Keep in sync with
// the rendered row so empty backfill actually overflows and iOS can bounce.
const SHELF_ROW_HEIGHT = 168 - 6 + 12 + 14 + 16; // 204

// Space under the floating transparent toolbar so the first shelf isn't covered.
const SHELF_TOOLBAR_CLEARANCE = 56;

// Brighter warm-wood backdrop shared by the shelf surface and ledges. The
// `soft-light` warm-amber wash over the texture boosts saturation + brightness
// without crushing the grain.
const WOOD_BG: React.CSSProperties = {
  backgroundColor: "#a8662a",
  backgroundImage:
    "linear-gradient(rgba(255,216,152,0.55), rgba(226,156,88,0.6)), url('/assets/books/wood-shelf.webp')",
  backgroundBlendMode: "soft-light, normal",
  // Texture is a 2x2 mirror-tiled seamless image; render it at 1024px so each
  // mirrored sub-tile shows at the original ~512px grain scale.
  backgroundSize: "auto, 1024px auto",
  backgroundRepeat: "repeat",
};

export function BooksShelfView({
  library,
  progressByPath,
  shelfView,
  onSetShelfView,
  onOpenBook,
  onImport,
  onDeleteBook,
  onMoveToTop,
  onMoveToBottom,
}: BooksShelfViewProps) {
  const { t } = useTranslation();
  const { isDarkMode } = useThemeFlags();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contextMenu, setContextMenu] = useState<ShelfContextMenu | null>(null);

  const openContextMenu = useMemo(
    () => (entry: BooksLibraryEntry, x: number, y: number) =>
      setContextMenu({ entry, x, y }),
    []
  );

  const contextMenuItems = useMemo<MenuItem[]>(() => {
    if (!contextMenu) return [];
    const { entry } = contextMenu;
    return [
      {
        type: "item",
        label: t("apps.books.contextMenu.moveToTop"),
        onSelect: () => onMoveToTop(entry.path),
      },
      {
        type: "item",
        label: t("apps.books.contextMenu.moveToBottom"),
        onSelect: () => onMoveToBottom(entry.path),
      },
      { type: "separator" },
      {
        type: "item",
        label: t("apps.books.contextMenu.delete"),
        onSelect: () => onDeleteBook(entry),
      },
    ];
  }, [contextMenu, t, onMoveToTop, onMoveToBottom, onDeleteBook]);

  useResizeObserverWithRef(containerRef, (entry) => {
    setWidth(entry.contentRect.width);
  });

  useResizeObserverWithRef(scrollRef, (entry) => {
    setViewportHeight(entry.contentRect.height);
  });

  // Seed the measured sizes synchronously on mount so the grid renders with the
  // correct column count on the very first paint. Without this the shelf starts
  // at width 0 (one book per row) and reflows once the ResizeObserver fires,
  // which the close-zoom overlay could otherwise measure mid-reflow and land on
  // the wrong spot.
  useLayoutEffect(() => {
    if (containerRef.current) {
      setWidth(containerRef.current.getBoundingClientRect().width);
    }
    if (scrollRef.current) {
      setViewportHeight(scrollRef.current.getBoundingClientRect().height);
    }
  }, []);

  // Books render only once the width is known (seeded synchronously above before
  // first paint, so there's no visible delay). This guarantees each cover MOUNTS
  // with its shared `layoutId` already attached at the correct grid position —
  // which (a) avoids animating the width-0 -> measured settle and (b) registers
  // the grid cover as the shared-layout lead from the start, so the very FIRST
  // grid->list toggle animates like every subsequent one.
  const measured = width > 0;

  // Keep layout changes instant ONLY for the initial load (first appearance /
  // async library population / window-open reflow), then animate everything
  // after — both the resize re-layout AND grid<->list toggles. `layoutId`/
  // `layout` stay attached from mount, so this only gates the transition
  // duration, never the projection registration (first toggle still morphs).
  const [layoutAnimated, setLayoutAnimated] = useState(false);
  useEffect(() => {
    if (layoutAnimated || library.length === 0) return;
    // Wait one frame past the first committed render that has books so the
    // initial books + the window-open reflow settle instantly, then enable
    // real animations for all subsequent layout changes.
    const id = requestAnimationFrame(() => setLayoutAnimated(true));
    return () => cancelAnimationFrame(id);
  }, [layoutAnimated, library.length]);

  const perRow = useMemo(() => {
    const usable = Math.max(0, width - SHELF_GUTTER * 2);
    // Fit N covers + (N-1) gaps (no trailing gap) within the usable width, so a
    // book isn't forced to wrap just because of a reserved trailing gap.
    return Math.max(
      1,
      Math.floor((usable + BOOK_GAP) / (BOOK_COVER_WIDTH + BOOK_GAP)) || 1
    );
  }, [width]);

  const rows = useMemo(() => {
    const chunked: BooksLibraryEntry[][] = [];
    for (let i = 0; i < library.length; i += perRow) {
      chunked.push(library.slice(i, i + perRow));
    }
    return chunked;
  }, [library, perRow]);

  // Backfill the shelf with empty rows so the bookcase fills the viewport even
  // when there are only a few books. Count against the area below the floating
  // toolbar.
  const emptyRowCount = useMemo(() => {
    if (viewportHeight <= 0) return 0;
    const fillHeight = Math.max(0, viewportHeight - SHELF_TOOLBAR_CLEARANCE);
    const rowsToFill = Math.ceil(fillHeight / SHELF_ROW_HEIGHT);
    return Math.max(0, rowsToFill - rows.length);
  }, [viewportHeight, rows.length]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={WOOD_BG}
    >
      {/* Dark-mode dim: above the wood, below books (z-[1]) and toolbar (z-20). */}
      {isDarkMode && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
          aria-hidden
        />
      )}
      {/* Full-bleed scroller under the floating toolbar. Native overflow only —
          no mask / JS rubber-band. touch-pan-y pans under page touch-action:none. */}
      <div
        ref={scrollRef}
        data-books-scroll
        className="absolute inset-0 z-[1] overflow-y-auto overscroll-y-auto touch-pan-y"
      >
        {library.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-8 text-center text-white/85"
            style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE + 24 }}
          >
            <div className="font-os-ui text-sm drop-shadow">
              {t("apps.books.shelf.emptyTitle")}
            </div>
            <div className="mt-1 font-os-ui text-xs text-white/65">
              {t("apps.books.shelf.emptyHint")}
            </div>
          </motion.div>
        ) : (
          // Grid and list render conditionally inside a single LayoutGroup so
          // each book (shared `layoutId`) morphs its position+size between the
          // two layouts when `shelfView` flips. No AnimatePresence/fade: the
          // book is the focus; surrounding chrome just appears/disappears.
          // Gated on `measured` so covers mount with layoutId at correct sizes.
          <LayoutGroup>
            {!measured ? null : shelfView === "grid" ? (
              <div
                className="flex flex-col pb-3"
                style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE }}
              >
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="relative">
                    {/* Books stand on the shelf, their base resting halfway down
                        the upper face (negative margin overlaps the ledge by half
                        the 12px face); z-[1] keeps books in front of that face. */}
                    <div
                      className="relative z-[1] flex items-end gap-5"
                      style={{
                        paddingLeft: SHELF_GUTTER,
                        paddingRight: SHELF_GUTTER,
                        minHeight: 168,
                        marginBottom: -6,
                      }}
                    >
                      {row.map((entry) => (
                        <ShelfBook
                          key={entry.path}
                          entry={entry}
                          progress={progressByPath[entry.path]}
                          onOpen={onOpenBook}
                          onContextMenu={openContextMenu}
                          morphLayout
                          layoutAnimated={layoutAnimated}
                          isDark={isDarkMode}
                        />
                      ))}
                    </div>
                    <ShelfLedge isDark={isDarkMode} />
                  </div>
                ))}
                {/* Empty shelves so the bookcase fills the viewport */}
                {Array.from({ length: emptyRowCount }).map((_, i) => (
                  <div key={`empty-${i}`} className="relative" aria-hidden>
                    <div style={{ minHeight: 168, marginBottom: -6 }} />
                    <ShelfLedge isDark={isDarkMode} />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="flex flex-col gap-1 p-2"
                style={{ paddingTop: SHELF_TOOLBAR_CLEARANCE }}
              >
                {library.map((entry) => (
                  <BookListRow
                    key={entry.path}
                    entry={entry}
                    progress={progressByPath[entry.path]}
                    onOpen={onOpenBook}
                    onContextMenu={openContextMenu}
                    morphLayout
                    layoutAnimated={layoutAnimated}
                    isDark={isDarkMode}
                  />
                ))}
              </div>
            )}
          </LayoutGroup>
        )}
      </div>

      {/* Transparent floating toolbar — overlays the scroller so wood scrolls
          underneath without a clipped gradient edge. Hits pass through except
          on the controls. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 bg-transparent px-3 pb-2 pt-7">
        <span className="font-apple-garamond text-white !text-[22px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {t("apps.books.title")}
        </span>
        <div className="pointer-events-auto flex items-center gap-1.5">
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              onClick={onImport}
              title={t("apps.books.shelf.import")}
              aria-label={t("apps.books.shelf.import")}
            >
              <Plus size={14} weight="bold" />
            </ToolbarButton>
          </ToolbarButtonGroup>
          <ToolbarButtonGroup>
            <ToolbarButton
              icon
              data-state={shelfView === "grid" ? "on" : "off"}
              onClick={() => onSetShelfView("grid")}
              title={t("apps.books.shelf.gridView")}
              aria-label={t("apps.books.shelf.gridView")}
            >
              <SquaresFour size={14} />
            </ToolbarButton>
            <ToolbarButton
              icon
              data-state={shelfView === "list" ? "on" : "off"}
              onClick={() => onSetShelfView("list")}
              title={t("apps.books.shelf.listView")}
              aria-label={t("apps.books.shelf.listView")}
            >
              <Rows size={14} />
            </ToolbarButton>
          </ToolbarButtonGroup>
        </div>
      </div>

      {/* Right-click / long-press context menu. Portaled to <body> so its
          absolute position resolves against the viewport (the shelf root is a
          `relative` containing block), matching the clientX/clientY we capture. */}
      {createPortal(
        <RightClickMenu
          position={
            contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null
          }
          onClose={() => setContextMenu(null)}
          items={contextMenuItems}
        />,
        document.body
      )}
    </div>
  );
}

function ShelfLedge({ isDark }: { isDark?: boolean }) {
  return (
    <div
      className="relative px-2"
      // Match the back-panel scrim so the wooden shelves dim too in dark mode.
      style={isDark ? { filter: "brightness(0.85)" } : undefined}
    >
      {/* Upper face — the board's top surface in perspective: a trapezoid that's
          wider at the front edge (bottom) and narrows toward the back wall (top),
          so it recedes inward. Lit at the front, shadowed at the back. */}
      <div
        className="h-[12px] w-full"
        style={{
          ...WOOD_BG,
          backgroundImage:
            "linear-gradient(to top, rgba(192,146,88,0.6), rgba(58,38,18,0.64)), url('/assets/books/wood-shelf.webp')",
          backgroundBlendMode: "overlay, normal",
          backgroundPosition: "center",
          clipPath:
            "polygon(28px 0, calc(100% - 28px) 0, 100% 100%, 0 100%)",
          // Warm mid-tone at the front (darker + more color than before, but
          // lighter than the dark back where it meets the wall).
          boxShadow: "inset 0 4px 5px -3px rgba(0,0,0,0.6)",
        }}
      />
      {/* Front lip — the rounded wooden edge that protrudes toward the viewer. */}
      <div
        className="h-[14px] w-full rounded-b-[3px]"
        style={{
          ...WOOD_BG,
          backgroundImage:
            "linear-gradient(rgba(250,216,150,0.5), rgba(86,58,28,0.5)), url('/assets/books/wood-shelf.webp')",
          backgroundBlendMode: "overlay, normal",
          backgroundPosition: "center",
          // The wide, soft drop shadow IS the cast shadow — box-shadow diffuses
          // on all sides (no hard clipped edges like a gradient rectangle had).
          boxShadow:
            "0 0 0 0.5px rgba(0,0,0,0.5), 0 14px 22px -4px rgba(0,0,0,0.7), 0 6px 10px -3px rgba(0,0,0,0.55), inset 0 2px 1px rgba(255,240,205,0.6)",
        }}
      />
      {/* Transparent spacer so the soft cast shadow has room before the next
          shelf row (the shadow itself comes from the lip's box-shadow above). */}
      <div className="h-[16px] w-full" />
    </div>
  );
}

function BookListRow({
  entry,
  progress,
  onOpen,
  onContextMenu,
  morphLayout,
  layoutAnimated,
  isDark,
}: {
  entry: BooksLibraryEntry;
  progress?: BookProgress;
  onOpen: (entry: BooksLibraryEntry, originRect?: BookOriginRect) => void;
  onContextMenu?: (entry: BooksLibraryEntry, x: number, y: number) => void;
  morphLayout?: boolean;
  layoutAnimated?: boolean;
  isDark?: boolean;
}) {
  const { t } = useTranslation();
  const { info, loading } = useBookCover(entry.path, entry.modifiedAt);
  const percent = progress ? Math.round(progress.percentage * 100) : 0;
  const coverRef = useRef<HTMLDivElement>(null);
  // Long-press (mouse or touch) opens the context menu; the hook's
  // consumeClickIfLongPressFired guards the click-to-open that follows.
  const longPress = usePointerLongPress((e) => {
    onContextMenu?.(entry, e.clientX, e.clientY);
  });

  return (
    <button
      type="button"
      onClick={() => {
        if (longPress.consumeClickIfLongPressFired()) return;
        onOpen(entry, coverRef.current?.getBoundingClientRect());
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(entry, e.clientX, e.clientY);
      }}
      onMouseDown={longPress.onMouseDown}
      onMouseMove={longPress.onMouseMove}
      onMouseUp={longPress.onMouseUp}
      onMouseLeave={longPress.onMouseLeave}
      onTouchStart={longPress.onTouchStart}
      onTouchMove={longPress.onTouchMove}
      onTouchEnd={longPress.onTouchEnd}
      onTouchCancel={longPress.onTouchCancel}
      className="group flex w-full items-center gap-3 rounded-[4px] bg-black/15 px-2 py-1.5 text-left touch-pan-y transition-colors hover:bg-black/30"
    >
      <BookMorphCover
        entry={entry}
        info={info}
        loading={loading}
        percent={percent}
        variant="list"
        morphLayout={morphLayout}
        layoutAnimated={layoutAnimated}
        isDark={isDark}
        coverRef={coverRef}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-apple-garamond text-white !text-[16px] leading-tight drop-shadow">
          {info?.title || entry.name}
        </div>
        {info?.author && (
          <div className="truncate font-os-ui text-[10px] text-white/70">
            {info.author}
          </div>
        )}
      </div>
      {percent > 0 && (
        <span className="shrink-0 font-os-ui text-[10px] text-white/80">
          {percent >= 100
            ? t("apps.books.shelf.finished")
            : t("apps.books.shelf.percentRead", { percent })}
        </span>
      )}
    </button>
  );
}
