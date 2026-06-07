import { AnimatePresence, motion } from "motion/react";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { WaterBackground } from "@/components/shared/WaterBackground";
import { DisplayMode } from "@/types/lyrics";

export type MediaVisualLayersProps = {
  effectiveDisplayMode: DisplayMode;
  /** When false, animated backgrounds are not mounted. */
  isActive: boolean;
  coverUrl: string | null | undefined;
  isPlaying: boolean;
  /** Applied to landscape/shader/mesh/water layers. */
  layerClassName?: string;
  /** Applied to the cover-art overlay container. */
  coverOverlayClassName?: string;
  /** Alt text for the cover overlay image. */
  coverTitle?: string;
  onCoverInteraction?: () => void;
  /**
   * When true, animated backgrounds render only if `hasTrack` is true
   * (Karaoke fullscreen). iPod screen overlay leaves this false.
   */
  requireTrackForBackgrounds?: boolean;
  hasTrack?: boolean;
  /** Use motion.img for cover (default true). iPod screen overlay uses false. */
  animatedCoverImage?: boolean;
};

export function MediaVisualLayers({
  effectiveDisplayMode,
  isActive,
  coverUrl,
  isPlaying,
  layerClassName = "absolute inset-0 z-[5]",
  coverOverlayClassName = "absolute inset-0 z-15",
  coverTitle,
  onCoverInteraction,
  requireTrackForBackgrounds = false,
  hasTrack = true,
  animatedCoverImage = true,
}: MediaVisualLayersProps) {
  const backgroundsEnabled =
    isActive && (!requireTrackForBackgrounds || hasTrack);

  return (
    <>
      {effectiveDisplayMode === DisplayMode.Landscapes && backgroundsEnabled && (
        <LandscapeVideoBackground isActive={isActive} className={layerClassName} />
      )}

      {effectiveDisplayMode === DisplayMode.Shader && backgroundsEnabled && (
        <AmbientBackground
          coverUrl={coverUrl ?? null}
          variant="warp"
          isActive={isActive}
          className={layerClassName}
        />
      )}

      {effectiveDisplayMode === DisplayMode.Mesh && backgroundsEnabled && (
        <MeshGradientBackground
          coverUrl={coverUrl ?? null}
          isActive={isActive}
          className={layerClassName}
        />
      )}

      {effectiveDisplayMode === DisplayMode.Water && backgroundsEnabled && (
        <WaterBackground
          coverUrl={coverUrl ?? null}
          isActive={isActive}
          className={layerClassName}
        />
      )}

      <AnimatePresence>
        {hasTrack &&
          coverUrl &&
          (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
            <motion.div
              className={coverOverlayClassName}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={
                onCoverInteraction
                  ? (e) => {
                      e.stopPropagation();
                      onCoverInteraction();
                    }
                  : undefined
              }
            >
              {animatedCoverImage ? (
                <motion.img
                  src={coverUrl}
                  alt={coverTitle}
                  className="w-full h-full object-cover brightness-50 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                />
              ) : (
                <img
                  src={coverUrl}
                  alt={coverTitle}
                  className="size-full object-cover brightness-50 pointer-events-none"
                />
              )}
            </motion.div>
          )}
      </AnimatePresence>
    </>
  );
}
