import { MeshGradient } from "@paper-design/shaders-react";
import { useCoverPalette } from "@/hooks/useCoverPalette";

interface MeshGradientBackgroundProps {
  /** URL of the cover art to derive colors from; falls back to default palette when null */
  coverUrl?: string | null;
  /** Whether the background should be visible */
  isActive?: boolean;
  className?: string;
}

/**
 * Mesh gradient shader background using Paper Design's MeshGradient.
 * StaticMeshGradient does not support animation (its shader has no u_time).
 * MeshGradient animates color blobs and distortion over time.
 * Colors are extracted from cover art when provided.
 */
export function MeshGradientBackground({
  coverUrl = null,
  isActive = true,
  className = "",
}: MeshGradientBackgroundProps) {
  const colors = useCoverPalette(coverUrl ?? null);

  if (!isActive) return null;

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
        speed={1}
        scale={1.16}
        rotation={90}
      />
    </div>
  );
}
