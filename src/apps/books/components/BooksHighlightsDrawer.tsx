import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { useSound, Sounds } from "@/hooks/useSound";
import { cn } from "@/lib/utils";
import {
  BOOKS_HIGHLIGHT_COLOR_HEX,
  type BookHighlight,
} from "@/stores/useBooksStore";
import { compareBookCfis } from "../utils/booksHighlightRanges";

interface BooksHighlightsDrawerProps {
  isOpen: boolean;
  highlights: readonly BookHighlight[];
  onClose: () => void;
  /** Jump the reader to this highlight. */
  onSelect: (highlight: BookHighlight) => void;
}

/**
 * Reading-order list of one book's highlights. Choosing a row reveals that
 * passage. Rendered inside the app drawer.
 */
export function BooksHighlightsList({
  highlights,
  onSelect,
}: {
  highlights: readonly BookHighlight[];
  onSelect: (highlight: BookHighlight) => void;
}) {
  const { t } = useTranslation();
  const ordered = useMemo(
    () =>
      highlights.toSorted(
        (a, b) =>
          compareBookCfis(a.cfiRange, b.cfiRange) || a.createdAt - b.createdAt
      ),
    [highlights]
  );

  if (ordered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-3 py-6 text-center">
        <p className="font-os-ui text-[12px] text-os-text-primary">
          {t("apps.books.highlights.emptyTitle")}
        </p>
        <p className="font-os-ui text-[11px] leading-snug text-os-text-secondary">
          {t("apps.books.highlights.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-1">
      {ordered.map((highlight) => {
        const colorLabel = t(`apps.books.selection.color.${highlight.color}`);
        const snippet =
          highlight.text.trim() || t("apps.books.highlights.untitled");
        return (
          <li key={highlight.id}>
            <button
              type="button"
              onClick={() => onSelect(highlight)}
              className={cn(
                "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left",
                "hover:bg-black/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-black/30"
              )}
              aria-label={`${colorLabel}. ${snippet}`}
            >
              <span
                className="mt-[3px] size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
                style={{
                  backgroundColor: BOOKS_HIGHLIGHT_COLOR_HEX[highlight.color],
                }}
                title={colorLabel}
                aria-hidden
              />
              <span className="line-clamp-3 min-w-0 flex-1 font-os-ui text-[12px] leading-snug text-os-text-primary">
                {snippet}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * App drawer of the open book's highlights, in reading order. Choosing a row
 * reveals that passage.
 */
export function BooksHighlightsDrawer({
  isOpen,
  highlights,
  onClose,
  onSelect,
}: BooksHighlightsDrawerProps) {
  const { t } = useTranslation();
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (isOpen) void playDrawerOpen();
    else void playDrawerClose();
  }, [isOpen, playDrawerOpen, playDrawerClose]);

  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("apps.books.highlights.title")}
      data-books-highlights-drawer=""
    >
      <BooksHighlightsList highlights={highlights} onSelect={onSelect} />
    </AppDrawer>
  );
}
