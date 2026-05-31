import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { GroupedSpotlightResult } from "./spotlightSearchUtils";

type SpotlightResultIconProps = {
  result: GroupedSpotlightResult;
  iconPx: number;
  thumbnailBorderRadius?: string;
};

export function SpotlightResultIcon({
  result,
  iconPx,
  thumbnailBorderRadius = "3px",
}: SpotlightResultIconProps) {
  if (result.type === "contact" && result.thumbnail) {
    return (
      <img
        src={result.thumbnail}
        alt=""
        className="flex-shrink-0 object-contain rounded-full"
        style={{
          width: iconPx,
          height: iconPx,
          background: "rgba(255,255,255,0.7)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
        }}
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  if (result.type === "contact" && result.initials) {
    return (
      <div
        className="flex-shrink-0 rounded-full flex items-center justify-center font-semibold text-white"
        style={{
          width: iconPx,
          height: iconPx,
          fontSize: `${Math.round(iconPx * 0.4)}px`,
          background: "linear-gradient(to bottom, #e0e0e0, #c8c8c8)",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)",
          textShadow: "0 1px 1px rgba(0,0,0,0.35), 0 0 2px rgba(0,0,0,0.12)",
          lineHeight: 1,
        }}
      >
        {result.initials}
      </div>
    );
  }

  if (result.thumbnail) {
    return (
      <img
        src={result.thumbnail}
        alt=""
        className="flex-shrink-0 object-cover"
        style={{
          width: iconPx,
          height: iconPx,
          borderRadius: thumbnailBorderRadius,
        }}
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  if (result.isEmoji) {
    return (
      <span
        className="flex-shrink-0 flex items-center justify-center leading-none"
        style={{
          width: iconPx,
          height: iconPx,
          fontSize: `${iconPx - 4}px`,
        }}
      >
        {result.icon}
      </span>
    );
  }

  return (
    <ThemedIcon
      name={result.icon}
      alt=""
      className="flex-shrink-0 [image-rendering:pixelated]"
      style={{
        width: iconPx,
        height: iconPx,
      }}
    />
  );
}
