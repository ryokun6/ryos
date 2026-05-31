interface SelectionMarqueeOverlayProps {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function SelectionMarqueeOverlay({
  left,
  top,
  width,
  height,
}: SelectionMarqueeOverlayProps) {
  return (
    <div
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
