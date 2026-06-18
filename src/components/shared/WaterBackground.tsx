import { Water } from "@paper-design/shaders-react";
import { useReducedGraphics } from "@/hooks/useReducedGraphics";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface WaterBackgroundProps {
  /** URL of the cover art to use as the base image */
  coverUrl?: string | null;
  /** Whether the background should be visible */
  isActive?: boolean;
  className?: string;
}

/**
 * Cap the backing buffer in the reduced tier (phones + low-power desktops) so
 * the Water fragment shader isn't paying for a full hi-dpi 4K-class surface
 * (the library default is 1920×1080×2dpi ≈ 8.3M px). ~720p with a 1× floor is
 * plenty here.
 */
const LOW_MAX_PIXEL_COUNT = 1280 * 720;
const LOW_MIN_PIXEL_RATIO = 1;
/**
 * Cap the backing buffer on capable desktops too: the Paper default is ~8.3M px
 * (1920×1080 × 2dpi per side), which is wasteful on hi-dpi / 4K displays. QHD
 * keeps the caustics crisp at a fraction of the cost.
 */
const DESKTOP_MAX_PIXEL_COUNT = 2560 * 1440;
/** Calmer caustics in the reduced tier; reduces steady-state GPU churn. */
const LOW_SPEED = 0.35;
const DESKTOP_SPEED = 0.5;

/**
 * Water shader background using Paper Design's Water.
 * Renders cover art with caustic/water effect overlay.
 *
 * Performance: the underlying ShaderMount already pauses its render loop while
 * the tab is hidden, and stops the loop entirely when `speed` is 0. We exploit
 * the latter for reduced-motion (static water image) and cap the buffer
 * resolution / animation speed on phones.
 */
export function WaterBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: WaterBackgroundProps) {
  const reducedQuality = useReducedGraphics();
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  if (!isActive || !coverUrl) return null;

  // speed 0 => ShaderMount halts its rAF loop, leaving a static water image.
  const speed = prefersReducedMotion
    ? 0
    : reducedQuality
      ? LOW_SPEED
      : DESKTOP_SPEED;

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Water
        width="100%"
        height="100%"
        image={coverUrl}
        colorBack="#8f8f8f"
        colorHighlight="#ffffff"
        highlights={0.4}
        layering={0}
        edges={0}
        waves={0}
        caustic={0.2}
        size={0.7}
        speed={speed}
        scale={1}
        fit="cover"
        maxPixelCount={
          reducedQuality ? LOW_MAX_PIXEL_COUNT : DESKTOP_MAX_PIXEL_COUNT
        }
        {...(reducedQuality ? { minPixelRatio: LOW_MIN_PIXEL_RATIO } : {})}
      />
    </div>
  );
}
