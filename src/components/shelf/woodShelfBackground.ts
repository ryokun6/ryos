import type { CSSProperties } from "react";

/** Warm wood backdrop shared by the shelf surface and ledges (Books + Stuff). */
export const WOOD_SHELF_BG: CSSProperties = {
  backgroundColor: "#a8662a",
  backgroundImage:
    "linear-gradient(rgba(255,216,152,0.55), rgba(226,156,88,0.6)), url('/assets/books/wood-shelf.webp')",
  backgroundBlendMode: "soft-light, normal",
  // Texture is a 2x2 mirror-tiled seamless image; render it at 1024px so each
  // mirrored sub-tile shows at the original ~512px grain scale.
  backgroundSize: "auto, 1024px auto",
  backgroundRepeat: "repeat",
};

/** Dark-mode scrim over the wood texture (above wood, below shelf content). */
export const WOOD_SHELF_DARK_SCRIM = "rgba(0,0,0,0.3)";
