import { memo, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useCoverPaletteResult } from "@/hooks/useCoverPalette";
import { ScrollingText } from "@/apps/ipod/components/screen";
import {
  normalizeCoverColor,
  resolveCoverGlowColor,
} from "@/apps/ipod/components/lyrics-display/colorUtils";
import {
  getTitleCardStyleCategory,
  makeTitleCardGlow,
  TITLE_CARD_BASE_SHADOW,
  TITLE_CARD_CONTENT_STYLE_FULLSCREEN,
  TITLE_CARD_CONTENT_STYLE_WINDOW,
  TITLE_CARD_COVER_IMAGE_STYLE_FULLSCREEN,
  TITLE_CARD_COVER_IMAGE_STYLE_WINDOW,
  TITLE_CARD_COVER_REFLECTION_STYLE,
  TITLE_CARD_COVER_REFLECTION_WRAPPER_STYLE,
  TITLE_CARD_COVER_SLEEVE_STYLE,
  TITLE_CARD_MOVEMENT_TRANSITION,
  TITLE_CARD_OUTER_STYLE_FULLSCREEN,
  TITLE_CARD_OUTER_STYLE_WINDOW,
  TITLE_CARD_REGULAR_GRADIENT_STYLE,
  TITLE_CARD_REGULAR_OUTLINE_STYLE,
  TITLE_CARD_SECONDARY_TEXT_STYLE,
  TITLE_CARD_TITLE_LINE_HEIGHT,
  type TitleCardLineStyle,
} from "./title-card-styles";

// Wrapped in React.memo because the parent overlays re-render on every
// playback tick (~10/s). The title card's props (title / artist / album /
// coverUrl / fontClassName / variant / isPlaying / bottomPaddingClass /
// onOpenCoverFlow / coverFlowLabel) are all stable for the lifetime of a
// track, so memo lets the entire title-card subtree skip those re-renders.
export const KaraokeTitleCard = memo(function KaraokeTitleCard({
  title,
  artist,
  album,
  fontClassName,
  variant,
  coverUrl,
  coverColor,
  onCoverColorResolved,
  onOpenCoverFlow,
  coverFlowLabel,
  bottomPaddingClass = "pb-12",
  isPlaying,
}: {
  title: string;
  artist?: string;
  album?: string;
  fontClassName: string;
  variant: "window" | "fullscreen";
  coverUrl?: string | null;
  coverColor?: string | null;
  onCoverColorResolved?: (coverColor: string, coverUrl: string) => void;
  onOpenCoverFlow?: () => void;
  coverFlowLabel?: string;
  bottomPaddingClass?: string;
  isPlaying: boolean;
}) {
  const styleCategory = getTitleCardStyleCategory(fontClassName);
  const cachedCoverColor = useMemo(
    () => normalizeCoverColor(coverColor),
    [coverColor]
  );
  const shouldExtractCoverColor = styleCategory === "glow-gold" && !cachedCoverColor;
  const paletteResult = useCoverPaletteResult(
    shouldExtractCoverColor ? (coverUrl ?? null) : null
  );
  const primaryGlow = useMemo(() => {
    const glowColor = cachedCoverColor ?? resolveCoverGlowColor(paletteResult.palette);
    return makeTitleCardGlow(glowColor);
  }, [cachedCoverColor, paletteResult.palette]);

  useEffect(() => {
    if (
      shouldExtractCoverColor &&
      paletteResult.source === "cover" &&
      paletteResult.coverUrl
    ) {
      onCoverColorResolved?.(primaryGlow.color, paletteResult.coverUrl);
    }
  }, [
    onCoverColorResolved,
    paletteResult.coverUrl,
    paletteResult.source,
    primaryGlow.color,
    shouldExtractCoverColor,
  ]);

  const titleTextSizeClass =
    variant === "fullscreen"
      ? "karaoke-title-card-title-fullscreen"
      : "karaoke-title-card-title-window";
  const secondaryTextSizeClass =
    variant === "fullscreen"
      ? "karaoke-title-card-secondary-fullscreen"
      : "karaoke-title-card-secondary-window";
  const isFullscreen = variant === "fullscreen";
  const coverImageStyle = isFullscreen
    ? TITLE_CARD_COVER_IMAGE_STYLE_FULLSCREEN
    : TITLE_CARD_COVER_IMAGE_STYLE_WINDOW;
  const titleCardContentStyle = isFullscreen
    ? TITLE_CARD_CONTENT_STYLE_FULLSCREEN
    : TITLE_CARD_CONTENT_STYLE_WINDOW;
  const titleCardOuterStyle = isFullscreen
    ? TITLE_CARD_OUTER_STYLE_FULLSCREEN
    : TITLE_CARD_OUTER_STYLE_WINDOW;
  const regularTextStyle = useMemo((): TitleCardLineStyle => {
    switch (styleCategory) {
      case "outline-blue":
      case "outline-red":
        return TITLE_CARD_REGULAR_OUTLINE_STYLE;
      case "glow-gold":
        return {
          color: primaryGlow.baseColor,
          lineHeight: TITLE_CARD_TITLE_LINE_HEIGHT,
          textShadow: TITLE_CARD_BASE_SHADOW,
          filter: "none",
        };
      case "glow-gradient":
      default:
        return TITLE_CARD_REGULAR_GRADIENT_STYLE;
    }
  }, [primaryGlow, styleCategory]);
  const metadataLines = useMemo(() => {
    const values: string[] = [];
    for (const value of [artist, album]) {
      const trimmed = value?.trim();
      if (!trimmed) continue;
      if (values.some((existing) => existing.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) {
        continue;
      }
      values.push(trimmed);
    }
    return values;
  }, [album, artist]);

  return (
    <motion.div
      key="karaoke-title-card"
      className={`absolute inset-0 z-40 pointer-events-none flex items-end justify-center pr-8 text-left text-white select-none ${bottomPaddingClass}`}
      style={titleCardOuterStyle}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.03 }}
      transition={{ duration: 0.28 }}
    >
      <motion.div
        layout="position"
        transition={TITLE_CARD_MOVEMENT_TRANSITION}
        className="w-full max-w-none flex items-center justify-start"
        style={titleCardContentStyle}
      >
        {coverUrl && (
          <div className="relative shrink-0" style={coverImageStyle}>
            {onOpenCoverFlow && (
              <button
                type="button"
                aria-label={coverFlowLabel}
                title={coverFlowLabel}
                className="absolute inset-0 z-10 p-0 border-0 bg-transparent cursor-pointer pointer-events-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCoverFlow();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
              />
            )}
            <div
              className="absolute inset-0 overflow-hidden"
              style={TITLE_CARD_COVER_SLEEVE_STYLE}
            >
              <img
                src={coverUrl}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </div>
            <div
              className="absolute top-full left-0 w-full pointer-events-none"
              style={TITLE_CARD_COVER_REFLECTION_WRAPPER_STYLE}
            >
              <img
                src={coverUrl}
                alt=""
                className="w-full h-auto"
                style={TITLE_CARD_COVER_REFLECTION_STYLE}
                draggable={false}
              />
            </div>
          </div>
        )}
        <div className="min-w-0 flex-1 text-left overflow-hidden">
          <ScrollingText
            text={title}
            align="left"
            fadeEdges
            isPlaying={isPlaying}
            scrollStartDelaySec={1}
            className={`${titleTextSizeClass} ${fontClassName} w-full max-w-full`}
            style={regularTextStyle}
          />
          {metadataLines.map((metadataLine) => (
            <div
              key={metadataLine}
              className={`text-white ${secondaryTextSizeClass} ${fontClassName} whitespace-pre-wrap break-words`}
              style={TITLE_CARD_SECONDARY_TEXT_STYLE}
            >
              {metadataLine}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
});
