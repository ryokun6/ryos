import { AnimatePresence } from "framer-motion";
import { PipPlayer } from "../PipPlayer";
import type { IpodAppController } from "./useIpodAppController";

type IpodPipPlayerProps = {
  c: IpodAppController;
};

export function IpodPipPlayer({ c }: IpodPipPlayerProps) {
  const {
    isMinimized,
    isFullScreen,
    tracks,
    currentIndex,
    isPlaying,
    togglePlay,
    startTrackSwitch,
    nextTrack,
    previousTrack,
    instanceId,
    restoreInstance,
  } = c;

  return (
    <AnimatePresence>
      {isMinimized && !isFullScreen && tracks.length > 0 && currentIndex >= 0 && (
        <PipPlayer
          currentTrack={tracks[currentIndex] || null}
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onNextTrack={() => {
            startTrackSwitch();
            nextTrack();
          }}
          onPreviousTrack={() => {
            startTrackSwitch();
            previousTrack();
          }}
          onRestore={() => {
            if (instanceId) restoreInstance(instanceId);
          }}
        />
      )}
    </AnimatePresence>
  );
}
