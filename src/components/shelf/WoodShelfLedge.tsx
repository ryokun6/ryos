import { WOOD_SHELF_BG } from "./woodShelfBackground";

/** 3D wooden shelf ledge — shared by Books and Stuff shelf views. */
export function WoodShelfLedge({ isDark }: { isDark?: boolean }) {
  return (
    <div
      className="relative px-2"
      // Match the back-panel scrim so the wooden shelves dim too in dark mode.
      style={isDark ? { filter: "brightness(0.85)" } : undefined}
    >
      {/* Upper face — the board's top surface in perspective: a trapezoid that's
          wider at the front edge (bottom) and narrows toward the back wall (top),
          so it recedes inward. Lit at the front, shadowed at the back. */}
      <div
        className="h-[12px] w-full"
        style={{
          ...WOOD_SHELF_BG,
          backgroundImage:
            "linear-gradient(to top, rgba(192,146,88,0.6), rgba(58,38,18,0.64)), url('/assets/books/wood-shelf.webp')",
          backgroundBlendMode: "overlay, normal",
          backgroundPosition: "center",
          clipPath:
            "polygon(28px 0, calc(100% - 28px) 0, 100% 100%, 0 100%)",
          // Warm mid-tone at the front (darker + more color than before, but
          // lighter than the dark back where it meets the wall).
          boxShadow: "inset 0 4px 5px -3px rgba(0,0,0,0.6)",
        }}
      />
      {/* Front lip — the rounded wooden edge that protrudes toward the viewer. */}
      <div
        className="h-[14px] w-full rounded-b-[3px]"
        style={{
          ...WOOD_SHELF_BG,
          backgroundImage:
            "linear-gradient(rgba(250,216,150,0.5), rgba(86,58,28,0.5)), url('/assets/books/wood-shelf.webp')",
          backgroundBlendMode: "overlay, normal",
          backgroundPosition: "center",
          // The wide, soft drop shadow IS the cast shadow — box-shadow diffuses
          // on all sides (no hard clipped edges like a gradient rectangle had).
          boxShadow:
            "0 0 0 0.5px rgba(0,0,0,0.5), 0 14px 22px -4px rgba(0,0,0,0.7), 0 6px 10px -3px rgba(0,0,0,0.55), inset 0 2px 1px rgba(255,240,205,0.6)",
        }}
      />
      {/* Transparent spacer so the soft cast shadow has room before the next
          shelf row (the shadow itself comes from the lip's box-shadow above). */}
      <div className="h-[16px] w-full" />
    </div>
  );
}
