import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Plus, SquaresFour, Rows } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import type { BooksLibraryEntry } from "../hooks/useBooksLogic";
import type { BookProgress, BooksShelfView } from "@/stores/useBooksStore";
import { ShelfBook } from "./ShelfBook";
import { BookCover } from "./BookCover";
import { useBookCover } from "../utils/useBookCover";

interface BooksShelfViewProps {
  library: BooksLibraryEntry[];
  progressByPath: Record<string, BookProgress>;
  shelfView: BooksShelfView;
  onSetShelfView: (view: BooksShelfView) => void;
  onOpenBook: (entry: BooksLibraryEntry) => void;
  onImport: () => void;
}

const BOOK_SLOT_WIDTH = 124; // cover width + horizontal gap
const SHELF_PADDING_X = 28;

// Brighter warm-wood backdrop shared by the shelf surface and ledges.
const WOOD_BG: React.CSSProperties = {
  backgroundColor: "#8a5e34",
  backgroundImage:
    "linear-gradient(rgba(120,80,40,0.12), rgba(60,34,12,0.28)), url('/assets/books/wood-shelf.png')",
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
}: BooksShelfViewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useResizeObserverWithRef(containerRef, (entry) => {
    setWidth(entry.contentRect.width);
  });

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
          <ToolbarButton
            label={t("apps.books.shelf.import")}
            onClick={onImport}
          >
            <Plus size={16} weight="bold" />
          </ToolbarButton>
          <div className="mx-0.5 h-5 w-px bg-white/25" />
          <ToolbarButton
            label={t("apps.books.shelf.gridView")}
            active={shelfView === "grid"}
            onClick={() => onSetShelfView("grid")}
          >
            <SquaresFour size={16} weight={shelfView === "grid" ? "fill" : "regular"} />
          </ToolbarButton>
          <ToolbarButton
            label={t("apps.books.shelf.listView")}
            active={shelfView === "list"}
            onClick={() => onSetShelfView("list")}
          >
            <Rows size={16} weight={shelfView === "list" ? "fill" : "regular"} />
          </ToolbarButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : shelfView === "grid" ? (
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
                    />
                  ))}
                </div>
                {/* Wooden ledge under the row */}
                <div className="relative px-1">
                  <div
                    className="h-[14px] w-full rounded-[2px]"
                    style={{
                      ...WOOD_BG,
                      backgroundImage:
                        "linear-gradient(rgba(0,0,0,0.15), rgba(0,0,0,0.4)), url('/assets/books/wood-shelf.png')",
                      backgroundPosition: "center",
                      boxShadow:
                        "0 6px 10px -2px rgba(0,0,0,0.5), inset 0 2px 1px rgba(255,255,255,0.3)",
                    }}
                  />
                  <div className="h-[10px] w-full bg-gradient-to-b from-black/30 to-transparent" />
                </div>
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-[4px] text-white transition-colors",
        active
          ? "bg-white/25 shadow-inner"
          : "bg-black/20 hover:bg-black/35"
      )}
    >
      {children}
    </button>
  );
}

function BookListRow({
  entry,
  progress,
  onOpen,
}: {
  entry: BooksLibraryEntry;
  progress?: BookProgress;
  onOpen: (entry: BooksLibraryEntry) => void;
}) {
  const { t } = useTranslation();
  const { info, loading } = useBookCover(entry.path, entry.modifiedAt);
  const percent = progress ? Math.round(progress.percentage * 100) : 0;

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className="group flex w-full items-center gap-3 rounded-[4px] bg-black/15 px-2 py-1.5 text-left transition-colors hover:bg-black/30"
    >
      <motion.div
        layoutId={`bookcover-${entry.path}`}
        className="relative h-[52px] w-[36px] shrink-0 overflow-hidden rounded-[2px] rounded-l-[3px]"
        style={{
          boxShadow: "0 3px 6px -2px rgba(0,0,0,0.6)",
        }}
        transition={{
          layout: { duration: 0.45, ease: [0.32, 0.72, 0, 1] },
        }}
      >
        <BookCover
          title={entry.name}
          fileName={entry.fileName}
          info={info}
          loading={loading}
        />
      </motion.div>
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
