import type { Ref } from "react";

interface SelectionMarqueeOverlayProps {
  /** When set, geometry is painted onto this element imperatively (no React state per move). */
  elementRef?: Ref<HTMLDivElement>;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export function SelectionMarqueeOverlay({
  elementRef,
  left = 0,
  top = 0,
  width = 0,
  height = 0,
}: SelectionMarqueeOverlayProps) {
  return (
    <div
      ref={elementRef}
      className="pointer-events-none absolute z-10 border"
      style={{
        left,
        top,
        width,
        height,
        borderColor: "rgba(128, 128, 128, 0.6)",
        backgroundColor: "rgba(128, 128, 128, 0.15)",
      }}
    />
  );
}
