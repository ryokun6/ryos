import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGroup, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Plus, SquaresFour, Rows } from "@phosphor-icons/react";
import {
  ToolbarButton,
  ToolbarButtonGroup,
} from "@/components/ui/toolbar-button";
import { RightClickMenu, type MenuItem } from "@/components/ui/right-click-menu";
import { useLongPress } from "@/hooks/useLongPress";
import { isTouchDevice } from "@/utils/device";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
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

const BOOK_SLOT_WIDTH = 124; // cover width + horizontal gap
const SHELF_PADDING_X = 28;

// Books slot min-height (168) + wooden ledge (14 + 10). Used to backfill the
// shelf with empty rows so it always looks like a full bookcase.
const SHELF_ROW_HEIGHT = 168 + 24;

// Brighter warm-wood backdrop shared by the shelf surface and ledges. The
// `soft-light` warm-amber wash over the texture boosts saturation + brightness
// without crushing the grain.
const WOOD_BG: React.CSSProperties = {
  backgroundColor: "#a8662a",
  backgroundImage:
    "linear-gradient(rgba(236,164,78,0.5), rgba(206,124,52,0.5)), url('/assets/books/wood-shelf.png')",
  backgroundBlendMode: "soft-light, normal",
  backgroundSize: "auto, 512px auto",
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

  const perRow = useMemo(() => {
    const usable = Math.max(0, width - SHELF_PADDING_X * 2);
    return Math.max(1, Math.floor(usable / BOOK_SLOT_WIDTH) || 1);
  }, [width]);

  const rows = useMemo(() => {
    const chunked: BooksLibraryEntry[][] = [];
    for (let i = 0; i < library.length; i += perRow) {
      chunked.push(library.slice(i, i + perRow));
    }
    return chunked;
  }, [library, perRow]);

  // Backfill the shelf with empty rows so the bookcase fills the viewport even
  // when there are only a few books.
  const emptyRowCount = useMemo(() => {
    if (viewportHeight <= 0) return 0;
    const rowsToFill = Math.ceil(viewportHeight / SHELF_ROW_HEIGHT);
    return Math.max(0, rowsToFill - rows.length);
  }, [viewportHeight, rows.length]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={WOOD_BG}
    >
      {/* Top toolbar */}
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 pb-2 pt-7 bg-gradient-to-b from-black/45 via-black/25 to-transparent">
        <span
          className="font-apple-garamond text-white !text-[22px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
        >
          {t("apps.books.title")}
        </span>
        <div className="flex items-center gap-1.5">
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

      <div
        ref={scrollRef}
        data-books-scroll
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {library.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-8 pt-10 text-center text-white/85"
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
              <div className="flex flex-col pb-3 pt-1">
                {rows.map((row, rowIndex) => (
                  <div key={rowIndex} className="relative">
                    {/* Books standing directly on the shelf (flush, no gap) */}
                    <div
                      className="flex items-end gap-5"
                      style={{
                        paddingLeft: SHELF_PADDING_X,
                        paddingRight: SHELF_PADDING_X,
                        minHeight: 168,
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
                        />
                      ))}
                    </div>
                    <ShelfLedge />
                  </div>
                ))}
                {/* Empty shelves so the bookcase fills the viewport */}
                {Array.from({ length: emptyRowCount }).map((_, i) => (
                  <div key={`empty-${i}`} className="relative" aria-hidden>
                    <div style={{ minHeight: 168 }} />
                    <ShelfLedge />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1 p-2">
                {library.map((entry) => (
                  <BookListRow
                    key={entry.path}
                    entry={entry}
                    progress={progressByPath[entry.path]}
                    onOpen={onOpenBook}
                    onContextMenu={openContextMenu}
                    morphLayout
                  />
                ))}
              </div>
            )}
          </LayoutGroup>
        )}
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

function ShelfLedge() {
  return (
    <div className="relative px-2">
      <div
        className="h-[14px] w-full rounded-[2px]"
        style={{
          ...WOOD_BG,
          backgroundImage:
            "linear-gradient(rgba(255,206,128,0.45), rgba(92,52,18,0.45)), url('/assets/books/wood-shelf.png')",
          backgroundBlendMode: "overlay, normal",
          backgroundPosition: "center",
          boxShadow:
            "0 0 0 0.5px rgba(0,0,0,0.55), 0 6px 10px -2px rgba(0,0,0,0.45), inset 0 2px 1px rgba(255,236,200,0.45)",
        }}
      />
      <div className="h-[10px] w-full bg-gradient-to-b from-black/30 to-transparent" />
    </div>
  );
}

function BookListRow({
  entry,
  progress,
  onOpen,
  onContextMenu,
  morphLayout,
}: {
  entry: BooksLibraryEntry;
  progress?: BookProgress;
  onOpen: (entry: BooksLibraryEntry, originRect?: BookOriginRect) => void;
  onContextMenu?: (entry: BooksLibraryEntry, x: number, y: number) => void;
  morphLayout?: boolean;
}) {
  const { t } = useTranslation();
  const { info, loading } = useBookCover(entry.path, entry.modifiedAt);
  const percent = progress ? Math.round(progress.percentage * 100) : 0;
  const coverRef = useRef<HTMLDivElement>(null);
  // Long-press opens the context menu on touch; suppress the resulting click.
  const suppressClickRef = useRef(false);
  const longPressHandlers = useLongPress<HTMLButtonElement>((e) => {
    suppressClickRef.current = true;
    const touch = e.touches[0];
    onContextMenu?.(entry, touch.clientX, touch.clientY);
  });

  return (
    <button
      type="button"
      onClick={() => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onOpen(entry, coverRef.current?.getBoundingClientRect());
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(entry, e.clientX, e.clientY);
      }}
      className="group flex w-full items-center gap-3 rounded-[4px] bg-black/15 px-2 py-1.5 text-left transition-colors hover:bg-black/30"
      {...(isTouchDevice() ? longPressHandlers : {})}
    >
      <BookMorphCover
        entry={entry}
        info={info}
        loading={loading}
        percent={percent}
        variant="list"
        morphLayout={morphLayout}
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
