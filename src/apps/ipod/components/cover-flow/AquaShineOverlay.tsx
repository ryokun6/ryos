// Aqua-style shine overlay for macOS X theme buttons
export function AquaShineOverlay() {
  return (
    <div
      className="pointer-events-none absolute top-[3px] blur-[0.5px] left-1/2 -translate-x-1/2 rounded-full"
      style={{
        width: "40%",
        height: "35%",
        background: "linear-gradient(to bottom, rgba(255, 255, 255, 0.3), rgba(255, 255, 255, 0))",
      }}
    />
  );
}
