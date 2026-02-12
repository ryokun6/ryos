import { Water } from "@paper-design/shaders-react";

interface WaterBackgroundProps {
  /** URL of the cover art to use as the base image */
  coverUrl?: string | null;
  /** Whether the background should be visible */
  isActive?: boolean;
  className?: string;
}

/**
 * Water shader background using Paper Design's Water.
 * Renders cover art with caustic/water effect overlay.
 */
export function WaterBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: WaterBackgroundProps) {
  if (!isActive || !coverUrl) return null;

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
        speed={0.5}
        scale={1}
        fit="cover"
      />
    </div>
  );
}
