import type { CSSProperties } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";

const CORNER_SIZE = 12;
const CORNER_MASK_Z_INDEX = 10004;

const sharedCornerStyle: CSSProperties = {
  width: CORNER_SIZE,
  height: CORNER_SIZE,
};

const corners: Array<{
  className: string;
  style: CSSProperties;
}> = [
  {
    className: "left-0 top-0",
    style: {
      background: `radial-gradient(circle at 100% 100%, transparent 0 ${CORNER_SIZE - 0.5}px, #000 ${CORNER_SIZE}px)`,
    },
  },
  {
    className: "right-0 top-0",
    style: {
      background: `radial-gradient(circle at 0 100%, transparent 0 ${CORNER_SIZE - 0.5}px, #000 ${CORNER_SIZE}px)`,
    },
  },
  {
    className: "bottom-0 left-0",
    style: {
      background: `radial-gradient(circle at 100% 0, transparent 0 ${CORNER_SIZE - 0.5}px, #000 ${CORNER_SIZE}px)`,
    },
  },
  {
    className: "bottom-0 right-0",
    style: {
      background: `radial-gradient(circle at 0 0, transparent 0 ${CORNER_SIZE - 0.5}px, #000 ${CORNER_SIZE}px)`,
    },
  },
];

export function DesktopCornerMask() {
  const { isMacOSTheme, isSystem7Theme } = useThemeFlags();

  if (!isMacOSTheme && !isSystem7Theme) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: CORNER_MASK_Z_INDEX }}
    >
      {corners.map(({ className, style }) => (
        <span
          key={className}
          className={`absolute block ${className}`}
          style={{ ...sharedCornerStyle, ...style }}
        />
      ))}
    </div>
  );
}
