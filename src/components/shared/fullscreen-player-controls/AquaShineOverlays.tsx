// Aqua-style shine overlays for macOS X theme (dark glass style)
export function AquaShineOverlays({
  variant,
}: {
  variant: "compact" | "responsive";
}) {
  return (
    <>
      {/* Top shine */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
        style={{
          top: "2px",
          height: "35%",
          width:
            variant === "compact" ? "calc(100% - 24px)" : "calc(100% - 28px)",
          borderRadius: "100px",
          background:
            "linear-gradient(rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
          filter: "blur(0.5px)",
          zIndex: 2,
        }}
      />
    </>
  );
}
