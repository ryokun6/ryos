import { motion } from "motion/react";
import { useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/useLongPress";
import { isTouchDevice } from "@/utils/device";
import type {
  BooksLibraryEntry,
  BookOriginRect,
} from "../hooks/useBooksLogic";
import type { BookProgress } from "@/stores/useBooksStore";
import { BookCover } from "./BookCover";
import { useBookCover } from "../utils/useBookCover";
import type { BookCoverInfo } from "../utils/useBookCover";

interface ShelfBookProps {
  entry: BooksLibraryEntry;
  progress?: BookProgress;
  onOpen: (entry: BooksLibraryEntry, originRect?: BookOriginRect) => void;
  /** Open the right-click / long-press context menu at the given viewport point. */
  onContextMenu?: (entry: BooksLibraryEntry, x: number, y: number) => void;
  /** When true, the book shares a `layoutId` so it morphs to/from list view. */
  morphLayout?: boolean;
}

// Shared-layout transition for the book morph between grid and list views.
export const COVER_LAYOUT_TRANSITION = {
  layout: { duration: 0.4, ease: [0.32, 0.72, 0, 1] as const },
};

/**
 * The whole visible "book" — cover + spine highlight + shadow + (grid-only)
 * reading-progress badge. It carries the shared `layoutId`, so the entire book
 * (not just the cover image) morphs between the grid and list layouts, keeping
 * its shadow and spine highlight attached as it moves. The list variant hides
 * the on-cover progress badge (the list row shows progress as separate text).
 */
export function BookMorphCover({
  entry,
  info,
  loading,
  percent,
  variant,
  morphLayout,
  coverRef,
}: {
  entry: BooksLibraryEntry;
  info: BookCoverInfo | null;
  loading: boolean;
  percent: number;
  variant: "grid" | "list";
  morphLayout?: boolean;
  coverRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const isGrid = variant === "grid";

  return (
    <motion.div
      ref={coverRef}
      data-book-path={entry.path}
      layoutId={morphLayout ? `bookcover-${entry.path}` : undefined}
      layout={morphLayout}
      transition={COVER_LAYOUT_TRANSITION}
      className={cn(
        "relative shrink-0 overflow-hidden",
        isGrid
          ? "h-[160px] w-[104px] rounded-[2px] rounded-l-[4px]"
          : "h-[52px] w-[36px] rounded-[2px] rounded-l-[3px]"
      )}
      style={{
        boxShadow: isGrid
          ? "0 10px 14px -6px rgba(0,0,0,0.65), -3px 0 4px -2px rgba(0,0,0,0.4)"
          : "0 3px 6px -2px rgba(0,0,0,0.6)",
      }}
    >
      <BookCover
        title={entry.name}
        fileName={entry.fileName}
        info={info}
        loading={loading}
      />
      {/* Spine highlight on the left edge (moves with the book). */}
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[6px] bg-gradient-to-r from-black/40 to-transparent" />
      <span className="pointer-events-none absolute inset-y-0 left-[6px] w-[2px] bg-white/15" />
      {/* Reading progress badge — grid only; the list row shows it as text. */}
      {isGrid && percent > 0 && (
        <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-[2px] text-center text-[9px] font-os-ui text-white">
          {percent >= 100
            ? t("apps.books.shelf.finished")
            : t("apps.books.shelf.percentRead", { percent })}
        </span>
      )}
    </motion.div>
  );
}

export function ShelfBook({
  entry,
  progress,
  onOpen,
  onContextMenu,
  morphLayout,
}: ShelfBookProps) {
  const { info, loading } = useBookCover(entry.path, entry.modifiedAt);
  const percent = progress ? Math.round(progress.percentage * 100) : 0;
  // A long-press opens the context menu; suppress the click-to-open that the
  // touchend would otherwise fire.
  const suppressClickRef = useRef(false);
  const longPressHandlers = useLongPress<HTMLButtonElement>((e) => {
    suppressClickRef.current = true;
    const touch = e.touches[0];
    onContextMenu?.(entry, touch.clientX, touch.clientY);
  });

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        onOpen(entry, e.currentTarget.getBoundingClientRect());
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(entry, e.clientX, e.clientY);
      }}
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.96 }}
      transition={{
        default: { type: "spring", stiffness: 400, damping: 30 },
      }}
      // No overflow-hidden here: the morphing book lives inside, and clipping it
      // to the button would chop the morph as it travels to/from the list.
      className="relative block h-[160px] w-[104px] shrink-0 focus:outline-none"
      title={info?.title || entry.name}
      {...(isTouchDevice() ? longPressHandlers : {})}
    >
      <BookMorphCover
        entry={entry}
        info={info}
        loading={loading}
        percent={percent}
        variant="grid"
        morphLayout={morphLayout}
      />
    </motion.button>
  );
}
