import { MeshGradient } from "@paper-design/shaders-react";
import { useCoverPalette } from "@/hooks/useCoverPalette";
import { useReducedGraphics } from "@/hooks/useReducedGraphics";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface MeshGradientBackgroundProps {
  /** URL of the cover art to derive colors from; falls back to default palette when null */
  coverUrl?: string | null;
  /** Whether the background should be visible */
  isActive?: boolean;
  className?: string;
}

/**
 * Cap the backing buffer in the reduced tier (phones + low-power desktops) so
 * the mesh-gradient fragment shader isn't paying for a full hi-dpi 4K-class
 * surface (the library default is 1920×1080×2dpi ≈ 8.3M px). ~720p with a 1×
 * floor is plenty for a soft, blurry gradient that mostly sits behind windows.
 */
const LOW_MAX_PIXEL_COUNT = 1280 * 720;
const LOW_MIN_PIXEL_RATIO = 1;
/**
 * Cap the backing buffer on capable desktops too: the Paper default is ~8.3M px
 * (1920×1080 × 2dpi per side), which is wasteful for a soft, blurry gradient
 * on hi-dpi / 4K displays. QHD is plenty crisp here.
 */
const DESKTOP_MAX_PIXEL_COUNT = 2560 * 1440;
/** Slightly calmer motion in the reduced tier; reduces steady-state GPU churn. */
const LOW_SPEED = 0.7;
const DESKTOP_SPEED = 1;

/**
 * Mesh gradient shader background using Paper Design's MeshGradient.
 * StaticMeshGradient does not support animation (its shader has no u_time).
 * MeshGradient animates color blobs and distortion over time.
 * Colors are extracted from cover art when provided.
 *
 * Performance: the underlying ShaderMount already pauses its render loop while
 * the tab is hidden, and stops the loop entirely when `speed` is 0. We exploit
 * the latter for reduced-motion (static gradient) and cap the buffer
 * resolution / animation speed on phones.
 */
export function MeshGradientBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: MeshGradientBackgroundProps) {
  const colors = useCoverPalette(isActive ? coverUrl ?? null : null);
  const reducedQuality = useReducedGraphics();
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (!isActive) return null;

  // speed 0 => ShaderMount halts its rAF loop, leaving a static gradient.
  const speed = prefersReducedMotion
    ? 0
    : reducedQuality
      ? LOW_SPEED
      : DESKTOP_SPEED;

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <MeshGradient
        width="100%"
        height="100%"
        colors={colors}
        distortion={0.38}
        swirl={0.2}
        grainMixer={0.06}
        grainOverlay={0.1}
        speed={speed}
        scale={1.16}
        rotation={90}
        maxPixelCount={
          reducedQuality ? LOW_MAX_PIXEL_COUNT : DESKTOP_MAX_PIXEL_COUNT
        }
        {...(reducedQuality ? { minPixelRatio: LOW_MIN_PIXEL_RATIO } : {})}
      />
    </div>
  );
}
