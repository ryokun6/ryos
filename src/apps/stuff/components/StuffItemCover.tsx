import { motion } from "motion/react";
import {
  BookOpen,
  Chair,
  CookingPot,
  Cpu,
  Disc,
  Package,
  TShirt,
  type Icon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { colorFromString, formatMoney } from "../utils/colors";
import {
  productAquaPhotoMatStyle,
  productAquaPhotoTileStyle,
  productAquaTileStyle,
  productAquaTileTextColor,
} from "../utils/productAquaTileStyle";
import {
  resolveStuffItemVisualKind,
  type StuffVisualKind,
} from "../utils/stuffItemVisualKind";
import {
  stuffItemCoverSrc,
  type StuffItem,
  type StuffStatus,
  type StuffTag,
} from "../types";
import {
  stuffStatusRibbonLabel,
  stuffStatusRibbonStyle,
} from "../utils/stuffStatusRibbon";
import { getStuffCoverDimensions } from "../utils/stuffCoverSizes";

interface StuffItemCoverProps {
  item: StuffItem;
  tags: StuffTag[];
  selected?: boolean;
  size?: "grid" | "list" | "detail";
  preview?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const KIND_ICONS: Record<StuffVisualKind, Icon> = {
  book: BookOpen,
  electronics: Cpu,
  kitchen: CookingPot,
  clothing: TShirt,
  furniture: Chair,
  media: Disc,
  other: Package,
};

function BookSpineHighlight() {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 w-[7px]"
      style={{
        background:
          "linear-gradient(to right, rgba(0,0,0,0.45), rgba(0,0,0,0.12) 55%, rgba(255,255,255,0.25))",
      }}
    />
  );
}

function ProductAquaChrome({ compact }: { compact?: boolean }) {
  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute left-1/2 z-[2] -translate-x-1/2 bg-gradient-to-b from-white/90 to-white/25 blur-[0.5px]",
          compact
            ? "top-px h-[30%] w-[calc(100%-6px)] rounded-[6px_6px_1px_1px]"
            : "top-0.5 h-[33%] max-h-3 w-[calc(100%-10px)] rounded-[10px_10px_2px_2px]"
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute bottom-0 left-1/2 z-[1] -translate-x-1/2 bg-gradient-to-t from-white/50 to-transparent blur-[1px]",
          compact
            ? "h-[28%] w-[calc(100%-5px)] rounded-[2px]"
            : "h-[33%] w-[calc(100%-8px)] rounded"
        )}
      />
    </>
  );
}

function ProductAquaWell({
  children,
  compact,
  hasImage,
}: {
  children: React.ReactNode;
  compact?: boolean;
  hasImage?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative z-[1] flex h-full w-full flex-col overflow-hidden",
        compact ? "rounded-[6px] p-0.5" : "rounded-[9px] p-1",
        // Photo covers use an opaque white well so a packshot's white background
        // matches the surface exactly and leaves no seam; the mat overlay above
        // the photo supplies the depth. Placeholders keep a frosted well.
        hasImage ? "bg-white" : "bg-white/35"
      )}
    >
      {children}
    </div>
  );
}

function GridTitleOverlay({
  item,
  primaryTag,
  price,
}: {
  item: StuffItem;
  primaryTag?: StuffTag;
  price: string | null;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-6",
        "opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      )}
    >
      <div className="truncate text-[10px] font-medium text-white">
        {item.title}
      </div>
      <div className="flex items-center justify-between gap-1">
        {primaryTag && (
          <span
            className="truncate rounded-full px-1.5 text-[9px] text-white"
            style={{ backgroundColor: primaryTag.color }}
          >
            {primaryTag.name}
          </span>
        )}
        {price && (
          <span className="ml-auto text-[9px] text-white/90">{price}</span>
        )}
      </div>
    </div>
  );
}

/** Horizontal status flag: right-pinned band with left swallowtail notch. */
const STATUS_RIBBON_CLIP =
  "polygon(0 0, 100% 0, 100% 100%, 0 100%, 0.5rem 50%)";

function StuffStatusRibbon({
  status,
  price,
}: {
  status: StuffStatus;
  price?: string | null;
}) {
  const statusLabel = stuffStatusRibbonLabel(status);
  const label = stuffStatusRibbonLabel(status, price);
  const { background, color } = stuffStatusRibbonStyle(status);
  const title =
    status === "for_sale" && price ? `${statusLabel} · ${price}` : statusLabel;

  return (
    <div
      className="pointer-events-none absolute right-0 top-2 z-[3] py-[0.28rem] pl-[0.7rem] pr-[0.4rem] text-[7px] font-semibold uppercase leading-none tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
      style={{
        backgroundColor: background,
        color,
        clipPath: STATUS_RIBBON_CLIP,
        WebkitClipPath: STATUS_RIBBON_CLIP,
      }}
      title={title}
    >
      {label}
    </div>
  );
}

export function StuffItemCover({
  item,
  tags,
  selected,
  size = "grid",
  preview = false,
  onClick,
  onContextMenu,
}: StuffItemCoverProps) {
  const visualKind = resolveStuffItemVisualKind(item, tags);
  const isBook = visualKind === "book";
  const isDetail = size === "detail";
  const isList = size === "list";
  const isGrid = size === "grid" || isDetail;
  const { width, height } = getStuffCoverDimensions(visualKind, size);
  const colors = colorFromString(item.id + item.title);
  const primaryTag = tags.find((tag) => item.tagIds.includes(tag.id));
  const price =
    formatMoney(item.prices.discounted ?? item.prices.original, item.prices.currency) ??
    null;
  const PlaceholderIcon = KIND_ICONS[visualKind];
  const aquaTint = primaryTag?.color ?? colors.fg;
  const aquaText = productAquaTileTextColor(aquaTint);
  const coverSrc = stuffItemCoverSrc(item);

  // Detail drawer: bare multiply against the white panel.
  // Shelf photo covers use clear glass instead (no multiply on tinted gel).
  if (preview && isDetail && !isBook && coverSrc) {
    return (
      <div
        className="relative shrink-0"
        style={{ width, height }}
        aria-hidden
      >
        <img
          src={coverSrc}
          alt=""
          className="h-full w-full object-contain mix-blend-multiply"
          draggable={false}
        />
      </div>
    );
  }

  const coverClassName = cn(
    "group relative shrink-0 overflow-hidden text-left outline-none",
    isBook
      ? "rounded-[2px] rounded-l-[4px] shadow-md"
      : cn("rounded-[10px]", isList && "rounded-[6px]"),
    !preview && selected && "ring-2 ring-os-accent ring-offset-1"
  );

  const coverStyle = isBook
    ? ({
        width,
        height,
        boxShadow: isGrid
          ? "-2px 4px 10px rgba(0,0,0,0.35), -1px 1px 0 rgba(0,0,0,0.2)"
          : "-1px 2px 4px rgba(0,0,0,0.25)",
      } as const)
    : ({
        width,
        height,
        // Photos: clear glass + light well (no multiply). Placeholders: tinted gel.
        ...(coverSrc
          ? productAquaPhotoTileStyle(aquaTint)
          : productAquaTileStyle(aquaTint)),
      } as const);

  const renderNonBookContent = () => {
    if (coverSrc) {
      return (
        <ProductAquaWell compact={isList} hasImage>
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 z-[1]",
              isList ? "rounded-[6px]" : "rounded-[9px]"
            )}
            style={productAquaPhotoMatStyle(aquaTint)}
          />
        </ProductAquaWell>
      );
    }

    return (
      <ProductAquaWell compact={isList}>
        <div
          className="flex h-full w-full flex-col items-center justify-center gap-1.5"
          style={{ color: aquaText }}
        >
          <PlaceholderIcon
            size={isDetail ? 44 : isGrid ? 36 : 18}
            weight="duotone"
            aria-hidden
            className="drop-shadow-[0_1px_1px_rgba(255,255,255,0.45)]"
          />
          {isGrid && size === "grid" && (
            <span
              className="line-clamp-2 text-center font-os-ui text-[11px] leading-tight"
              style={{ textShadow: "0 1px 1px rgba(255,255,255,0.35)" }}
            >
              {item.title}
            </span>
          )}
        </div>
      </ProductAquaWell>
    );
  };

  const coverBody = (
    <>
      {!isBook && <ProductAquaChrome compact={isList} />}

      {isBook ? (
        coverSrc ? (
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="flex h-full w-full flex-col justify-between px-2 pb-2 pt-8"
            style={{ backgroundColor: colors.bg, color: colors.fg }}
          >
            {/* Garamond via inline style, not `font-apple-garamond`: Aqua forces
                `font-size: 1.5rem !important` on that class (About dialog), which
                would inflate em line-height and defeat text-[13px]/leading-[0.9]. */}
            <span
              className={cn(
                "line-clamp-4 text-center leading-[0.9]",
                isGrid ? "text-[13px]" : "text-[9px] line-clamp-2"
              )}
              style={{ fontFamily: "var(--font-apple-garamond)" }}
            >
              {item.title}
            </span>
            {isGrid && item.brand && (
              <span className="truncate text-[10px] opacity-80">{item.brand}</span>
            )}
          </div>
        )
      ) : (
        renderNonBookContent()
      )}

      {isBook && <BookSpineHighlight />}

      {isGrid && !preview && size === "grid" && (
        <GridTitleOverlay item={item} primaryTag={primaryTag} price={price} />
      )}

      {!preview && !isList && (
        <StuffStatusRibbon status={item.status} price={price} />
      )}
    </>
  );

  if (preview) {
    return (
      <div className={coverClassName} style={coverStyle} aria-hidden>
        {coverBody}
      </div>
    );
  }

  return (
    <motion.button
      type="button"
      whileHover={size === "grid" ? { y: -8 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={coverClassName}
      style={coverStyle}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {coverBody}
    </motion.button>
  );
}
