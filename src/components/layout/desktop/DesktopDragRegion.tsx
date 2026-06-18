import type { CSSProperties } from "react";

interface DesktopDragRegionProps {
  isDesktopApp: boolean;
  isXpTheme: boolean;
}

export function DesktopDragRegion({
  isDesktopApp,
  isXpTheme,
}: DesktopDragRegionProps) {
  if (!isDesktopApp || !isXpTheme) {
    return null;
  }

  const dragRegionStyle = {
    height: 32,
    cursor: "default",
    WebkitAppRegion: "drag",
  } as CSSProperties;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100]"
      style={dragRegionStyle}
      onDoubleClick={() => {
        void window.ryosDesktop?.toggleMaximize();
      }}
    />
  );
}
