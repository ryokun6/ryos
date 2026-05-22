import { Disc, MusicNote } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type IpodEmptyArtworkKind = "album" | "playlist";

interface IpodArtworkPlaceholderProps {
  kind?: IpodEmptyArtworkKind;
  /** Blue selection row — lightens the chrome and tints the glyph. */
  selected?: boolean;
  /** Gradient tile only — use while an image URL exists but bits are still in flight (avoids a false “missing art” glyph). */
  hideGlyph?: boolean;
  className?: string;
}

/**
 * Empty-state artwork for the modern iPod skin (missing album / playlist
 * covers). While a real JPEG is downloading, callers may set `hideGlyph` so only
 * the neutral silver tile appears under a zero-opacity `<img>`.
 */
export function IpodArtworkPlaceholder({
  kind = "album",
  selected = false,
  hideGlyph = false,
  className,
}: IpodArtworkPlaceholderProps) {
  const Icon = kind === "playlist" ? MusicNote : Disc;
  return (
    <div
      aria-hidden
      className={cn(
        "ipod-empty-artwork grid place-items-center overflow-hidden",
        selected && "is-selected",
        className
      )}
    >
      {hideGlyph ? null : (
        <Icon
          className={cn(
            "h-[52%] w-[52%] shrink-0",
            selected ? "text-white/80" : "text-[#6a6f76]"
          )}
          weight="fill"
        />
      )}
    </div>
  );
}
