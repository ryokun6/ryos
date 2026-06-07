import { useState } from "react";
import { motion } from "motion/react";

const FALLBACK_RGB = "169,175,190";

export interface EmulatorPresetCardData {
  id: string;
  name: string;
  year?: string;
  image?: string;
  rgb: string;
  screenSize?: { width: number; height: number };
}

export interface EmulatorPresetGridProps {
  presets: EmulatorPresetCardData[];
  onSelectPreset: (presetId: string) => void;
  /** Use native aspect ratio from screenSize (Mac) or fixed card height (PC). */
  layout?: "aspect-ratio" | "fixed-height";
  className?: string;
}

function EmulatorPresetCard({
  preset,
  layout,
  onSelect,
}: {
  preset: EmulatorPresetCardData;
  layout: "aspect-ratio" | "fixed-height";
  onSelect: () => void;
}) {
  const [thumbError, setThumbError] = useState(false);
  const showThumb = !!preset.image && !thumbError;
  const textShadow = "0 1px 3px rgba(0,0,0,0.95)";
  const rgb = preset.rgb || FALLBACK_RGB;
  const bgColor = `rgb(${rgb})`;
  const overlayColor = `rgba(${rgb},0.5)`;

  const cardClassName =
    layout === "fixed-height"
      ? "group relative rounded overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-all duration-200 w-full flex flex-col shrink-0 h-[100px] [box-shadow:0_4px_12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] hover:[box-shadow:0_8px_24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)]"
      : "group relative rounded overflow-hidden bg-neutral-800 hover:bg-neutral-700 transition-all duration-200 w-full flex flex-col min-h-[100px] @md:min-h-0 [box-shadow:0_4px_12px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)] hover:[box-shadow:0_8px_24px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.12)]";

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      className={cardClassName}
      whileTap={{
        scale: 0.97,
        y: 0,
        transition: { type: "spring", duration: 0.15 },
      }}
    >
      <div
        className="w-full flex-1 min-h-0 relative shrink-0 overflow-hidden"
        style={{
          ...(layout === "aspect-ratio" && preset.screenSize
            ? { aspectRatio: `${preset.screenSize.width} / ${preset.screenSize.height}` }
            : {}),
          backgroundColor: bgColor,
        }}
      >
        {showThumb ? (
          <img
            src={preset.image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover object-top opacity-80 transition-all duration-[800ms] ease-out group-hover:scale-105 group-hover:opacity-100"
            onError={() => setThumbError(true)}
          />
        ) : null}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-200 group-hover:opacity-20"
          style={{ backgroundColor: overlayColor }}
          aria-hidden
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: `linear-gradient(to top, ${bgColor} 0%, transparent 55%)`,
        }}
        aria-hidden
      />
      <div className="absolute bottom-0 left-2 right-2 pt-2 pb-2 flex flex-col items-start gap-0.5 @md:flex-row @md:justify-between @md:items-baseline z-10 pointer-events-none">
        <span
          className="text-white font-apple-garamond !text-[18px] leading-tight truncate max-w-full"
          style={{ textShadow }}
        >
          {preset.name}
        </span>
        {preset.year ? (
          <span
            className="text-neutral-300 text-[10px] shrink-0 opacity-100 @md:opacity-0 transition-opacity duration-200 @md:group-hover:opacity-100"
            style={{ textShadow }}
          >
            {preset.year}
          </span>
        ) : null}
      </div>
    </motion.button>
  );
}

export function EmulatorPresetGrid({
  presets,
  onSelectPreset,
  layout = "aspect-ratio",
  className = "",
}: EmulatorPresetGridProps) {
  const gridClassName =
    layout === "fixed-height"
      ? "preset-grid grid grid-cols-1 @md:grid-cols-3 gap-2 content-start w-full max-w-md @md:max-w-none self-start pb-[calc(1rem+env(safe-area-inset-bottom,0px))] @md:pb-0"
      : "preset-grid grid grid-cols-1 @md:grid-cols-3 gap-2 w-full max-w-md @md:max-w-none pb-[calc(1rem+env(safe-area-inset-bottom,0px))] @md:pb-0";

  return (
    <div className={`${gridClassName} ${className}`.trim()}>
      {presets.map((preset) => (
        <EmulatorPresetCard
          key={preset.id}
          preset={preset}
          layout={layout}
          onSelect={() => onSelectPreset(preset.id)}
        />
      ))}
    </div>
  );
}
