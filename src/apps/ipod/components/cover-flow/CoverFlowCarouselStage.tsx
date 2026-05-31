import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CoverImage } from "./CoverImage";
import type { CoverFlowController } from "./useCoverFlowController";

type CarouselController = Pick<
  CoverFlowController,
  | "containerRef"
  | "ipodMode"
  | "isModernIpodCoverFlow"
  | "gesturesDisabled"
  | "handlePanStart"
  | "handlePan"
  | "handlePanEnd"
  | "handleWheel"
  | "handleCarouselClick"
  | "startLongPress"
  | "endLongPress"
  | "visibleCovers"
  | "showCD"
  | "isPlaying"
  | "selectedIndex"
  | "currentCoverIndex"
  | "onTogglePlay"
  | "isFlipped"
  | "isFlipAnimating"
  | "playItemInPlace"
>;

interface CoverFlowCarouselStageProps {
  vm: CarouselController;
}

export function CoverFlowCarouselStage({ vm }: CoverFlowCarouselStageProps) {
  const {
    containerRef,
    ipodMode,
    isModernIpodCoverFlow,
    gesturesDisabled,
    handlePanStart,
    handlePan,
    handlePanEnd,
    handleWheel,
    handleCarouselClick,
    startLongPress,
    endLongPress,
    visibleCovers,
    showCD,
    isPlaying,
    selectedIndex,
    currentCoverIndex,
    onTogglePlay,
    isFlipped,
    isFlipAnimating,
    playItemInPlace,
  } = vm;

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "absolute inset-0 flex items-center justify-center",
        gesturesDisabled
          ? "cursor-default"
          : "cursor-grab active:cursor-grabbing",
      )}
      onPanStart={gesturesDisabled ? undefined : handlePanStart}
      onPan={gesturesDisabled ? undefined : handlePan}
      onPanEnd={gesturesDisabled ? undefined : handlePanEnd}
      onWheel={gesturesDisabled ? undefined : handleWheel}
      onClick={handleCarouselClick}
      onMouseDown={gesturesDisabled ? undefined : () => startLongPress()}
      onMouseUp={gesturesDisabled ? undefined : () => endLongPress()}
      onMouseLeave={gesturesDisabled ? undefined : () => endLongPress()}
      onTouchStart={gesturesDisabled ? undefined : () => startLongPress()}
      onTouchEnd={gesturesDisabled ? undefined : () => endLongPress()}
      onTouchCancel={gesturesDisabled ? undefined : () => endLongPress()}
      style={{
        touchAction: gesturesDisabled ? "auto" : "none",
        overflow: "visible",
      }}
    >
      <div
        className="relative flex items-center justify-center w-full"
        style={{
          height: ipodMode && isModernIpodCoverFlow ? "76%" : "75%",
          marginTop: ipodMode ? "-8%" : "-2%",
          perspective: `${(ipodMode ? 65 : 60) * 1.5}cqmin`,
          transformStyle: "preserve-3d",
        }}
      >
        <AnimatePresence mode="popLayout">
          {visibleCovers.map(({ item, position }) => (
            <CoverImage
              key={item.key}
              track={item.track}
              position={position}
              ipodMode={ipodMode}
              compactIpodCarousel={isModernIpodCoverFlow}
              showCD={showCD}
              isPlaying={isPlaying && selectedIndex === currentCoverIndex}
              onTogglePlay={onTogglePlay}
              selectedIndex={selectedIndex}
              currentIndex={currentCoverIndex}
              onPlayTrackInPlace={playItemInPlace}
              hideSleeveAtCenter={
                (isFlipped || isFlipAnimating) && position === 0
              }
              isAlbumViewOpen={isFlipped && position === 0}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
