import { cn } from "@/lib/utils";
import { CoverFlowReflectiveFloor } from "./CoverFlowReflectiveFloor";
import { CoverFlowCarouselStage } from "./CoverFlowCarouselStage";
import { CoverFlowTrackInfoBar } from "./CoverFlowTrackInfoBar";
import { CoverFlowAlbumFlipOverlay } from "./CoverFlowAlbumFlipOverlay";
import type { CoverFlowController } from "./useCoverFlowController";

interface CoverFlowInlineViewProps {
  vm: CoverFlowController;
}

export function CoverFlowInlineView({ vm }: CoverFlowInlineViewProps) {
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
    <div
      className={cn(
        "relative w-full h-full overflow-hidden",
        isModernIpodCoverFlow ? "bg-white" : "bg-black",
        ipodMode ? "ipod-force-font" : "karaoke-force-font",
      )}
      style={{ containerType: "size" }}
    >
      <CoverFlowReflectiveFloor isModernIpodCoverFlow={isModernIpodCoverFlow} />
      <CoverFlowCarouselStage vm={vm} />
      <CoverFlowTrackInfoBar vm={vm} />
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
      />
    </div>
  );
}
