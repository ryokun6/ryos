import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import type { BooksLibraryEntry } from "../hooks/useBooksLogic";
import type { BookProgress } from "@/stores/useBooksStore";
import { ShelfBook } from "./ShelfBook";

interface BooksShelfViewProps {
  library: BooksLibraryEntry[];
  progressByPath: Record<string, BookProgress>;
  onOpenBook: (entry: BooksLibraryEntry) => void;
  onImport: () => void;
}

const BOOK_SLOT_WIDTH = 132; // cover width + horizontal gap
const SHELF_PADDING_X = 28;

export function BooksShelfView({
  library,
  progressByPath,
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

  // Append the "import" tile as the final slot.
  const slots = useMemo(() => {
    const items: Array<
      | { kind: "book"; entry: BooksLibraryEntry }
      | { kind: "import" }
    > = library.map((entry) => ({ kind: "book" as const, entry }));
    items.push({ kind: "import" });
    return items;
  }, [library]);

  const rows = useMemo(() => {
    const chunked: (typeof slots)[] = [];
    for (let i = 0; i < slots.length; i += perRow) {
      chunked.push(slots.slice(i, i + perRow));
    }
    return chunked;
  }, [slots, perRow]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-y-auto"
      style={{
        backgroundColor: "#5a3a1c",
        backgroundImage:
          "linear-gradient(rgba(35,18,4,0.35), rgba(35,18,4,0.55)), url('/assets/books/wood-shelf.png')",
        backgroundSize: "auto, 512px auto",
        backgroundRepeat: "repeat",
      }}
    >
      <div className="flex flex-col px-1 py-2">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="relative">
            {/* Books standing on the shelf */}
            <div
              className="flex items-end gap-2"
              style={{
                paddingLeft: SHELF_PADDING_X,
                paddingRight: SHELF_PADDING_X,
                minHeight: 176,
              }}
            >
              {row.map((slot) =>
                slot.kind === "book" ? (
                  <ShelfBook
                    key={slot.entry.path}
                    entry={slot.entry}
                    progress={progressByPath[slot.entry.path]}
                    onOpen={onOpenBook}
                  />
                ) : (
                  <button
                    key="import-tile"
                    type="button"
                    onClick={onImport}
                    className={cn(
                      "group flex flex-col items-center justify-center",
                      "h-[160px] w-[104px] shrink-0 rounded-[3px]",
                      "border-2 border-dashed border-white/40 bg-black/15",
                      "text-white/70 transition-colors hover:bg-black/25 hover:text-white"
                    )}
                  >
                    <span className="text-3xl leading-none">+</span>
                    <span className="mt-1 px-2 text-center text-[11px] font-os-ui">
                      {t("apps.books.shelf.import")}
                    </span>
                  </button>
                )
              )}
            </div>
            {/* Wooden ledge under the row */}
            <div className="relative -mt-1 px-1">
              <div
                className="h-[14px] w-full rounded-[2px]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.45)), url('/assets/books/wood-shelf.png')",
                  backgroundSize: "auto, 512px auto",
                  backgroundPosition: "center",
                  boxShadow:
                    "0 6px 10px -2px rgba(0,0,0,0.55), inset 0 2px 1px rgba(255,255,255,0.25)",
                }}
              />
              <div className="h-[10px] w-full bg-gradient-to-b from-black/35 to-transparent" />
            </div>
          </div>
        ))}

        {library.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pointer-events-none px-8 pt-6 text-center text-white/80"
          >
            <div className="font-os-ui text-sm drop-shadow">
              {t("apps.books.shelf.emptyTitle")}
            </div>
            <div className="mt-1 font-os-ui text-xs text-white/60">
              {t("apps.books.shelf.emptyHint")}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
