import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { CoverFlowReflectiveFloor } from "./CoverFlowReflectiveFloor";
import { CoverFlowModernTitlebar } from "./CoverFlowModernTitlebar";
import { CoverFlowCarouselStage } from "./CoverFlowCarouselStage";
import { CoverFlowTrackInfoBar } from "./CoverFlowTrackInfoBar";
import { CoverFlowAlbumFlipOverlay } from "./CoverFlowAlbumFlipOverlay";
import type { CoverFlowController } from "./useCoverFlowController";

interface CoverFlowOverlayViewProps {
  vm: CoverFlowController;
  isVisible: boolean;
}

export function CoverFlowOverlayView({ vm, isVisible }: CoverFlowOverlayViewProps) {
  const {
    ipodMode,
    isModernIpodCoverFlow,
    isPlaying,
    isFlipped,
    setIsFlipped,
    currentItem,
    flipCoverUrl,
    flipCoverSizeCqmin,
    albumTracks,
    selectedTrackInAlbum,
    playingPositionInAlbum,
    handleSelectAlbumTrack,
  } = vm;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={cn(
            "absolute inset-0 z-50 overflow-hidden",
            isModernIpodCoverFlow ? "bg-white" : "bg-black",
            ipodMode && "border border-black border-2 rounded-[2px]",
            ipodMode ? "ipod-force-font" : "karaoke-force-font",
          )}
          style={{ containerType: "size" }}
          initial={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: ipodMode ? 1 : 1.05 }}
          transition={{ duration: ipodMode ? 0.2 : 0.35, ease: "easeOut" }}
        >
          <CoverFlowReflectiveFloor
            isModernIpodCoverFlow={isModernIpodCoverFlow}
          />
          {isModernIpodCoverFlow && (
            <CoverFlowModernTitlebar isPlaying={isPlaying} />
          )}
          <CoverFlowCarouselStage vm={vm} />
          <CoverFlowTrackInfoBar vm={vm} animated />
          <CoverFlowAlbumFlipOverlay
            isFlipped={isFlipped}
            currentItem={currentItem}
            coverUrl={flipCoverUrl}
            coverSizeCqmin={flipCoverSizeCqmin}
            tracks={albumTracks}
            selectedTrackInAlbum={selectedTrackInAlbum}
            playingPositionInAlbum={playingPositionInAlbum}
            isPlaying={isPlaying}
            isModernIpodCoverFlow={isModernIpodCoverFlow}
            ipodMode={ipodMode}
            onPlayTrack={handleSelectAlbumTrack}
            onExitFlip={() => setIsFlipped(false)}
            titlebarOffset
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
