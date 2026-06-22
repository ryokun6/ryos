import { cn } from "@/lib/utils";
import { colorFromString } from "../utils/booksReader";
import type { BookCoverInfo } from "../utils/useBookCover";

interface BookCoverProps {
  /** Display title used for the fallback cover. */
  title: string;
  fileName: string;
  info: BookCoverInfo | null;
  loading: boolean;
  className?: string;
  /** Larger typography for the full-size (zoomed) cover. */
  large?: boolean;
  /**
   * How the cover image fills its box. `"cover"` (default) crops to fill;
   * `"contain"` shows the full cover centered (used by the zoom overlay so the
   * whole book is visible as it grows).
   */
  fit?: "cover" | "contain";
}

/**
 * Renders an EPUB cover image, or a generated spine-colored fallback cover
 * with the title/author when the book has no embedded cover.
 */
export function BookCover({
  title,
  fileName,
  info,
  loading,
  className,
  large = false,
  fit = "cover",
}: BookCoverProps) {
  const displayTitle = info?.title || title;
  const author = info?.author || null;

  if (info?.coverUrl) {
    return (
      <img
        src={info.coverUrl}
        alt={displayTitle}
        draggable={false}
        className={cn(
          "h-full w-full select-none object-center",
          fit === "contain" ? "object-contain" : "object-cover",
          className
        )}
      />
    );
  }

  const { bg, fg } = colorFromString(fileName);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-between overflow-hidden select-none",
        large ? "p-4" : "p-2",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${bg} 0%, rgba(0,0,0,0.35) 130%)`,
        color: fg,
      }}
    >
      <div
        className={cn(
          "font-serif font-semibold leading-tight line-clamp-5",
          large ? "text-lg" : "text-[10px]"
        )}
        style={{ fontFamily: '"EB Garamond", Georgia, serif' }}
      >
        {loading ? "…" : displayTitle}
      </div>
      {author && (
        <div
          className={cn(
            "opacity-80 line-clamp-2",
            large ? "text-sm" : "text-[8px]"
          )}
          style={{ fontFamily: '"EB Garamond", Georgia, serif' }}
        >
          {author}
        </div>
      )}
    </div>
  );
}
