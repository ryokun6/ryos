import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { BooksLibraryEntry } from "../hooks/useBooksLogic";
import type { BookProgress } from "@/stores/useBooksStore";
import { BookCover } from "./BookCover";
import { useBookCover } from "../utils/useBookCover";

interface ShelfBookProps {
  entry: BooksLibraryEntry;
  progress?: BookProgress;
  onOpen: (entry: BooksLibraryEntry) => void;
}

export function ShelfBook({ entry, progress, onOpen }: ShelfBookProps) {
  const { t } = useTranslation();
  const { info, loading } = useBookCover(entry.path, entry.modifiedAt);
  const percent = progress ? Math.round(progress.percentage * 100) : 0;

  return (
    <div className="flex w-[104px] shrink-0 flex-col items-center">
      <motion.button
        type="button"
        layoutId={`bookcover-${entry.path}`}
        onClick={() => onOpen(entry)}
        whileHover={{ y: -6 }}
        whileTap={{ scale: 0.96 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative h-[160px] w-[104px] overflow-hidden rounded-[2px] rounded-l-[4px] focus:outline-none"
        style={{
          boxShadow:
            "0 10px 14px -6px rgba(0,0,0,0.65), -3px 0 4px -2px rgba(0,0,0,0.4)",
        }}
        title={info?.title || entry.name}
      >
        <BookCover
          title={entry.name}
          fileName={entry.fileName}
          info={info}
          loading={loading}
        />
        {/* Spine highlight on the left edge */}
        <span className="pointer-events-none absolute inset-y-0 left-0 w-[6px] bg-gradient-to-r from-black/40 to-transparent" />
        <span className="pointer-events-none absolute inset-y-0 left-[6px] w-[2px] bg-white/15" />
        {percent > 0 && (
          <span className="pointer-events-none absolute bottom-0 left-0 right-0 bg-black/55 px-1 py-[2px] text-center text-[9px] font-os-ui text-white">
            {percent >= 100
              ? t("apps.books.shelf.finished")
              : t("apps.books.shelf.percentRead", { percent })}
          </span>
        )}
      </motion.button>
      <div className="mt-1 line-clamp-2 px-[2px] text-center text-[10px] leading-tight text-white/90 drop-shadow">
        {info?.title || entry.name}
      </div>
    </div>
  );
}
