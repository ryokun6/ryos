import { AnimatePresence, motion } from "framer-motion";
import { LandscapeVideoBackground } from "@/components/shared/LandscapeVideoBackground";
import { AmbientBackground } from "@/components/shared/AmbientBackground";
import { MeshGradientBackground } from "@/components/shared/MeshGradientBackground";
import { WaterBackground } from "@/components/shared/WaterBackground";
import { DisplayMode } from "@/types/lyrics";
import type { Track } from "@/stores/useIpodStore";

type KaraokeVisualLayersProps = {
  effectiveDisplayMode: DisplayMode;
  visualBackgroundActive: boolean;
  currentTrack: Track | null;
  coverUrl: string | null | undefined;
  isPlaying: boolean;
  layerClassName: string;
  coverOverlayClassName: string;
  onCoverInteraction: () => void;
};

export function KaraokeVisualLayers({
  effectiveDisplayMode,
  visualBackgroundActive,
  currentTrack,
  coverUrl,
  isPlaying,
  layerClassName,
  coverOverlayClassName,
  onCoverInteraction,
}: KaraokeVisualLayersProps) {
  return (
    <>
      {effectiveDisplayMode === DisplayMode.Landscapes &&
        visualBackgroundActive &&
        currentTrack && (
        <LandscapeVideoBackground
          isActive={visualBackgroundActive}
          className={layerClassName}
        />
      )}

      {effectiveDisplayMode === DisplayMode.Shader &&
        visualBackgroundActive &&
        currentTrack && (
        <AmbientBackground
          coverUrl={coverUrl ?? null}
          variant="warp"
          isActive={visualBackgroundActive}
          className={layerClassName}
        />
      )}

      {effectiveDisplayMode === DisplayMode.Mesh &&
        visualBackgroundActive &&
        currentTrack && (
        <MeshGradientBackground
          coverUrl={coverUrl ?? null}
          isActive={visualBackgroundActive}
          className={layerClassName}
        />
      )}

      {effectiveDisplayMode === DisplayMode.Water &&
        visualBackgroundActive &&
        currentTrack && (
        <WaterBackground
          coverUrl={coverUrl ?? null}
          isActive={visualBackgroundActive}
          className={layerClassName}
        />
      )}

      <AnimatePresence>
        {currentTrack &&
          coverUrl &&
          (effectiveDisplayMode === DisplayMode.Cover || !isPlaying) && (
          <motion.div
            className={coverOverlayClassName}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={(e) => {
              e.stopPropagation();
              onCoverInteraction();
            }}
          >
            <motion.img
              src={coverUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover brightness-50 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
