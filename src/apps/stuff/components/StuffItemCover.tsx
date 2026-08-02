import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
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
import { ScrollingText } from "@/apps/ipod/components/screen";
import { stuffTagDisplayName } from "../utils/stuffTagDisplayName";
import { colorFromString } from "../utils/colors";
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
  stuffStatusLabelDefault,
  type StuffItem,
  type StuffPrices,
  type StuffStatus,
  type StuffTag,
} from "../types";
import {
  stuffStatusRibbonStyle,
  stuffStatusStruckColor,
} from "../utils/stuffStatusRibbon";
import {
  formatStuffNameplatePrice,
  resolveStuffSoldNameplatePrices,
} from "../utils/stuffSoldNameplate";
import { nameplatePoseFromId } from "../utils/stuffNameplatePose";
import { getStuffCoverDimensions } from "../utils/stuffCoverSizes";
import { useStuffCoverIsCutout } from "../hooks/useStuffCoverIsCutout";
import { useStuffItemCoverSrc } from "../hooks/useStuffItemCoverSrc";

/** Match karaoke / iPod now-playing: dwell before marquee starts. */
export const STUFF_TITLE_SCROLL_START_DELAY_SEC = 1;

/** Classic Mac CD Audio volume icon — optimized 256² for empty CD trays. */
const STUFF_CD_DISC_ICON = "/icons/stuff/cd-disc.png";

interface StuffItemCoverProps {
  item: StuffItem;
  tags: StuffTag[];
  selected?: boolean;
  size?: "grid" | "list" | "detail";
  preview?: boolean;
  /** Subtle pulse/rotate while AI background removal runs. */
  processing?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const KIND_ICONS: Record<StuffVisualKind, Icon> = {
  book: BookOpen,
  cd: Disc,
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

/** Left hinge + clear plastic sheen for a CD jewel case. */
function JewelCaseChrome({ compact }: { compact?: boolean }) {
  const hingeWidth = compact ? 5 : 8;
  return (
    <>
      {/* Hinge / spine edge — crisp linear chrome ridge (matches ~1px left radius) */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-[2]"
        style={{
          width: hingeWidth,
          background:
            "linear-gradient(to right, rgba(95,102,112,0.55) 0%, rgba(210,218,228,0.8) 14%, rgba(255,255,255,0.78) 28%, rgba(185,194,206,0.45) 48%, rgba(120,130,142,0.28) 100%)",
        }}
      />
      {/* Thin hard-edged specular along the hinge — not a soft oval bloom */}
      <div
        className="pointer-events-none absolute inset-y-0 z-[3]"
        style={{
          left: Math.max(1, hingeWidth - (compact ? 1.5 : 2)),
          width: compact ? 1 : 1.5,
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.85) 28%, rgba(255,255,255,0.55) 62%, rgba(255,255,255,0.2) 100%)",
        }}
      />
      {/* Clear plastic front glare — flatter linear sheen, no soft left radial */}
      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "linear-gradient(to right, transparent 0%, transparent 10%, rgba(255,255,255,0.1) 22%, transparent 38%, transparent 74%, rgba(255,255,255,0.14) 100%)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.5), inset 0 0 0 2px rgba(120,130,145,0.22)",
        }}
      />
      {/* Top lip highlight */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-px bg-white/55"
        style={{ marginLeft: hingeWidth }}
      />
    </>
  );
}

/** Frosted clear tray for CD jewel-case artwork. */
function JewelCaseTray({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  // Slim clear lip around the tray so cover art fills more of the case.
  // Left stays larger than the hinge (compact 5 / grid 8) so art clears it.
  // Right stays tight so the case doesn't read too wide on the open edge.
  // Slightly wider left lip at grid/detail so art clears the hinge on the
  // ~123×108 jewel case (142:125 mm); list stays tight for the compact thumbnail.
  const inset = compact
    ? { top: 1, right: 0, bottom: 1, left: 6 }
    : { top: 3, right: 2, bottom: 3, left: 10 };

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(236,242,248,0.28) 48%, rgba(210,220,230,0.38) 100%)",
      }}
    >
      <div
        className="absolute overflow-hidden"
        style={{
          top: inset.top,
          right: inset.right,
          bottom: inset.bottom,
          left: inset.left,
          background: "rgba(255,255,255,0.18)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.4), inset 0 1px 3px rgba(0,0,0,0.1)",
        }}
      >
        {children}
      </div>
    </div>
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
  isHovered,
}: {
  item: StuffItem;
  primaryTag?: StuffTag;
  isHovered: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1.5 pt-6",
        "opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      )}
    >
      <ScrollingText
        text={item.title}
        align="left"
        fadeEdges
        isPlaying={isHovered}
        resetOnPause
        scrollStartDelaySec={STUFF_TITLE_SCROLL_START_DELAY_SEC}
        className="w-full min-w-0 text-[10px] font-medium leading-tight text-white"
      />
      {primaryTag ? (
        <div className="mt-1 flex items-center gap-1">
          <span
            className="truncate rounded-full px-1.5 text-[9px] text-white"
            style={{ backgroundColor: primaryTag.color }}
          >
            {stuffTagDisplayName(primaryTag, t)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Small museum-style nameplate overlaid on the cover near its bottom edge.
 * `bottom: 6px` keeps the plate inset on the cover face (pose offsetY max is
 * small so random jitter cannot push it past the cover bottom). High z keeps
 * it above the cover and wood ledge.
 *
 * - `for_sale`: asking/original price alone (tooltip keeps status · price)
 * - `sold`: ~~original~~ salePrice Sold (sale = sold ?? asking ?? original)
 * - other statuses: localized status label
 */
function StuffStatusNameCard({
  itemId,
  status,
  prices,
}: {
  itemId: string;
  status: StuffStatus;
  prices: StuffPrices;
}) {
  const { t } = useTranslation();
  const statusLabel = t(`apps.stuff.status.${status}`, {
    defaultValue: stuffStatusLabelDefault(status),
  });
  const freeLabel = t("apps.stuff.price.free", { defaultValue: "Free" });
  // Asking/original for for_sale; 0 → localized Free.
  const forSalePrice =
    status === "for_sale"
      ? formatStuffNameplatePrice(
          prices.discounted ?? prices.original,
          prices.currency,
          freeLabel
        )
      : null;
  const soldPrices =
    status === "sold"
      ? resolveStuffSoldNameplatePrices(prices, freeLabel)
      : null;
  const soldTitleParts = soldPrices
    ? [
        soldPrices.originalStruckFormatted,
        soldPrices.saleFormatted,
        statusLabel,
      ].filter(Boolean)
    : [];
  // For-sale with an asking price: show price on the plate; tooltip keeps status + price.
  const title =
    status === "for_sale" && forSalePrice
      ? `${statusLabel} · ${forSalePrice}`
      : soldTitleParts.length > 0
        ? soldTitleParts.join(" ")
        : statusLabel;
  const { background, color } = stuffStatusRibbonStyle(status);
  // Soft wash so the cover peeks through: status ~80% → slightly darker translucent.
  const backgroundImage = `linear-gradient(105deg, color-mix(in srgb, ${background} 80%, transparent), color-mix(in srgb, color-mix(in srgb, ${background}, #000 28%) 55%, transparent))`;
  // Opaque wash toward plate (not black): dark gray was invisible on sold blue.
  const struckColor = status === "sold" ? stuffStatusStruckColor(status) : null;
  const { rotateDeg, offsetX, offsetY } = nameplatePoseFromId(itemId);

  let content: ReactNode = statusLabel;
  if (status === "for_sale" && forSalePrice) {
    content = forSalePrice;
  } else if (status === "sold" && soldPrices) {
    const hasPriceBits =
      soldPrices.originalStruckFormatted || soldPrices.saleFormatted;
    content = hasPriceBits ? (
      <span className="inline-flex items-baseline gap-[0.35em] overflow-visible">
        {soldPrices.originalStruckFormatted && struckColor ? (
          <span
            className="stuff-status-nameplate-struck"
            style={{
              // Inline color wins over Tailwind text-* (no !important elsewhere).
              color: struckColor,
              WebkitTextFillColor: struckColor,
              textDecorationColor: struckColor,
            }}
          >
            {soldPrices.originalStruckFormatted}
          </span>
        ) : null}
        {soldPrices.saleFormatted ? (
          <span
            style={{
              color,
              WebkitTextFillColor: color,
            }}
          >
            {soldPrices.saleFormatted}
          </span>
        ) : null}
        <span
          style={{
            color,
            WebkitTextFillColor: color,
          }}
        >
          {statusLabel}
        </span>
      </span>
    ) : (
      statusLabel
    );
  }

  return (
    <div
      className="pointer-events-none absolute bottom-[6px] right-0 z-20 overflow-visible whitespace-nowrap rounded-[3px] px-2 py-[3px] text-[13px] leading-none shadow-[0_1px_2px_rgba(0,0,0,0.4)] ring-1 ring-black/20 font-permanent-marker"
      style={{
        backgroundImage,
        color,
        textShadow: "0 0.5px 1px rgba(0,0,0,0.45)",
        // Handwriting face — Title Case from status labels reads better than uppercase.
        // Avoid `.font-permanent-marker` alone for size: Aqua forces font-size on
        // some named font utilities; size stays on text-[13px] here.
        fontFamily: "var(--font-permanent-marker)",
        transformOrigin: "100% 100%",
        transform: `translate(${offsetX}px, ${offsetY}px) rotate(${rotateDeg}deg)`,
      }}
      title={title}
    >
      {content}
    </div>
  );
}

function CutoutCoverStage({
  coverSrc,
  width,
  height,
  isGrid,
  isList,
  processing,
  selected,
  preview,
  onClick,
  onContextMenu,
  onHoverChange,
  children,
}: {
  coverSrc: string;
  width: number;
  height: number;
  isGrid: boolean;
  isList: boolean;
  processing?: boolean;
  selected?: boolean;
  preview?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onHoverChange?: (hovered: boolean) => void;
  children?: React.ReactNode;
}) {
  // Drop-shadow follows opaque pixels so the cutout sits on the shelf.
  const dropShadow = isList
    ? "drop-shadow(0 2px 3px rgba(0,0,0,0.28)) drop-shadow(0 1px 1px rgba(0,0,0,0.18))"
    : isGrid
      ? "drop-shadow(0 8px 14px rgba(0,0,0,0.32)) drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
      : "drop-shadow(0 4px 8px rgba(0,0,0,0.28))";

  const stageClassName = cn(
    "group relative shrink-0 overflow-visible bg-transparent text-left outline-none",
    !preview && selected && "ring-2 ring-os-accent ring-offset-1 rounded-[10px]"
  );

  // Bottom-align so the subject sits on the shelf ledge; object-contain
  // fills the stage, then a slight scale-up makes cutouts read larger
  // while staying fully visible (stage is overflow-visible).
  const image = (
    <img
      src={coverSrc}
      alt=""
      className="h-full w-full origin-bottom scale-110 object-contain object-bottom"
      style={{ filter: dropShadow }}
      draggable={false}
    />
  );

  const body = (
    <>
      {image}
      {children}
      {processing ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[10px]"
        >
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent"
            animate={{ x: ["-60%", "160%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 animate-pulse bg-white/15" />
        </div>
      ) : null}
    </>
  );

  if (preview) {
    return (
      <motion.div
        className={stageClassName}
        style={{ width, height }}
        aria-hidden
        animate={
          processing
            ? { rotate: [-1.2, 1.2, -1.2], scale: [1, 1.015, 1] }
            : undefined
        }
        transition={
          processing
            ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
            : undefined
        }
      >
        {body}
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      whileHover={isGrid && !isList ? { y: -8 } : undefined}
      animate={
        processing
          ? { rotate: [-1.2, 1.2, -1.2], scale: [1, 1.015, 1] }
          : undefined
      }
      transition={
        processing
          ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
          : { type: "spring", stiffness: 400, damping: 28 }
      }
      className={stageClassName}
      style={{ width, height }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
    >
      {body}
    </motion.button>
  );
}

export function StuffItemCover({
  item,
  tags,
  selected,
  size = "grid",
  preview = false,
  processing = false,
  onClick,
  onContextMenu,
}: StuffItemCoverProps) {
  const [isHovered, setIsHovered] = useState(false);
  const visualKind = resolveStuffItemVisualKind(item, tags);
  const isBook = visualKind === "book";
  const isCd = visualKind === "cd";
  const isFramedCover = isBook || isCd;
  const isDetail = size === "detail";
  const isList = size === "list";
  const isGrid = size === "grid" || isDetail;
  const { width, height } = getStuffCoverDimensions(visualKind, size);
  const colors = colorFromString(item.id + item.title);
  const primaryTag = tags.find((tag) => item.tagIds.includes(tag.id));
  const PlaceholderIcon = KIND_ICONS[visualKind];
  const aquaTint = primaryTag?.color ?? colors.fg;
  const aquaText = productAquaTileTextColor(aquaTint);
  const coverSrc = useStuffItemCoverSrc(item);
  const transparencyCacheKey =
    item.coverBlobId?.trim() ||
    item.imageDataUrl?.trim() ||
    item.imageUrl?.trim() ||
    coverSrc;
  const isCutout = useStuffCoverIsCutout(coverSrc, {
    coverPresentation: item.coverPresentation,
    cacheKey: transparencyCacheKey,
  });

  // Background-removed covers: fully transparent stage + subject drop shadow.
  // Applies to products, books, and CDs so cutouts sit cleanly on the shelf.
  if (isCutout && coverSrc) {
    return (
      <CutoutCoverStage
        coverSrc={coverSrc}
        width={width}
        height={height}
        isGrid={isGrid}
        isList={isList}
        processing={processing}
        selected={selected}
        preview={preview}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onHoverChange={setIsHovered}
      >
        {isGrid && !preview && size === "grid" ? (
          <GridTitleOverlay
            item={item}
            primaryTag={primaryTag}
            isHovered={isHovered}
          />
        ) : null}
        {!preview && !isList ? (
          <StuffStatusNameCard
            itemId={item.id}
            status={item.status}
            prices={item.prices}
          />
        ) : null}
      </CutoutCoverStage>
    );
  }

  // Detail drawer: bare cover against the panel (normal blend).
  // Shelf photo covers use clear glass instead. Books / CDs keep their
  // skeuomorphic frame in detail preview.
  if (preview && isDetail && !isFramedCover && coverSrc) {
    return (
      <motion.div
        className="relative shrink-0"
        style={{ width, height }}
        aria-hidden
        animate={
          processing
            ? { rotate: [-1.2, 1.2, -1.2], scale: [1, 1.015, 1] }
            : undefined
        }
        transition={
          processing
            ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
            : undefined
        }
      >
        <img
          src={coverSrc}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
        {processing ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 animate-pulse rounded-[10px] bg-white/30"
          />
        ) : null}
      </motion.div>
    );
  }

  // Outer stage stays overflow-visible so the status nameplate's 2px peek
  // past the cover bottom isn't clipped. Rounding lives on the inner shell.
  const coverRadiusClass = isBook
    ? "rounded-[2px] rounded-l-[4px]"
    : isCd
      ? "rounded-l-[1px] rounded-r-[3px]"
      : cn("rounded-[10px]", isList && "rounded-[6px]");

  const coverClassName = cn(
    "group relative shrink-0 overflow-visible text-left outline-none",
    coverRadiusClass,
    (isBook || isCd) && "shadow-md",
    !preview && selected && "ring-2 ring-os-accent ring-offset-1"
  );

  const coverShellClassName = cn(
    "absolute inset-0 overflow-hidden",
    coverRadiusClass
  );

  const framedCoverShadow = isGrid
    ? "-2px 4px 10px rgba(0,0,0,0.35), -1px 1px 0 rgba(0,0,0,0.2)"
    : "-1px 2px 4px rgba(0,0,0,0.25)";

  const coverStyle = isBook
    ? ({
        width,
        height,
        boxShadow: framedCoverShadow,
      } as const)
    : isCd
      ? ({
          width,
          height,
          // Frosted clear plastic — no opaque black tray fill.
          background:
            "linear-gradient(155deg, rgba(255,255,255,0.58) 0%, rgba(232,240,248,0.36) 52%, rgba(200,214,228,0.48) 100%)",
          boxShadow: isGrid
            ? `${framedCoverShadow}, inset -1px 0 0 rgba(255,255,255,0.35)`
            : framedCoverShadow,
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

  const renderCdContent = () => {
    if (coverSrc) {
      return (
        <JewelCaseTray compact={isList}>
          <img
            src={coverSrc}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        </JewelCaseTray>
      );
    }

    // Empty CD: disc art in the clear tray; title/artist like empty books
    // (top + bottom), so type clears the spindle hole.
    return (
      <JewelCaseTray compact={isList}>
        <img
          src={STUFF_CD_DISC_ICON}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
          style={{
            // Fill most of the clear tray; height is the limiting axis
            // (landscape case + object-contain). Title/artist sit on the disc.
            width: isList ? "96%" : "102%",
            height: isList ? "96%" : "102%",
          }}
        />
        {!isList && (
          <div
            className={cn(
              "relative z-[1] flex h-full w-full flex-col justify-between",
              isGrid ? "px-2.5 pb-2.5 pt-3" : "px-2 pb-2 pt-2.5"
            )}
            style={{
              color: "rgba(32, 36, 42, 0.92)",
              // Marker face via CSS var (not a utility class) — Aqua themes
              // force `font-size` on some named font utilities.
              fontFamily: "var(--font-permanent-marker)",
            }}
          >
            <span
              className={cn(
                "line-clamp-3 text-center leading-[1.05]",
                isGrid ? "text-[13px]" : "text-[11px]"
              )}
              style={{
                textShadow:
                  "0 0 4px rgba(255,255,255,0.95), 0 1px 0 rgba(255,255,255,0.85)",
              }}
            >
              {item.title}
            </span>
            {isGrid && item.brand && (
              <span
                className="truncate text-center text-[11px] opacity-90"
                style={{
                  textShadow:
                    "0 0 4px rgba(255,255,255,0.95), 0 1px 0 rgba(255,255,255,0.8)",
                }}
              >
                {item.brand}
              </span>
            )}
          </div>
        )}
      </JewelCaseTray>
    );
  };

  const coverBody = (
    <>
      <div className={coverShellClassName}>
        {!isFramedCover && <ProductAquaChrome compact={isList} />}

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
                <span className="truncate text-center text-[10px] opacity-80">
                  {item.brand}
                </span>
              )}
            </div>
          )
        ) : isCd ? (
          renderCdContent()
        ) : (
          renderNonBookContent()
        )}

        {isBook && <BookSpineHighlight />}
        {isCd && <JewelCaseChrome compact={isList} />}

        {isGrid && !preview && size === "grid" && (
          <GridTitleOverlay
            item={item}
            primaryTag={primaryTag}
            isHovered={isHovered}
          />
        )}
      </div>

      {!preview && !isList && (
        <StuffStatusNameCard
          itemId={item.id}
          status={item.status}
          prices={item.prices}
        />
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {coverBody}
    </motion.button>
  );
}
