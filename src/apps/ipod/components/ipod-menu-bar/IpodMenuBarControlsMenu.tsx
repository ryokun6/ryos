import { MediaControlsMenu } from "@/components/shared/menubar/MediaControlsMenu";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarControlsMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const {
    t,
    tracks,
    isPlaying,
    togglePlay,
    previousTrack,
    nextTrack,
    isShuffled,
    toggleShuffle,
    isLoopAll,
    toggleLoopAll,
    isLoopCurrent,
    toggleLoopCurrent,
  } = vm;

  return (
    <MediaControlsMenu
      menuLabel={t("apps.ipod.menu.controls")}
      tracksCount={tracks.length}
      isPlaying={isPlaying}
      onTogglePlay={togglePlay}
      onPreviousTrack={previousTrack}
      onNextTrack={nextTrack}
      playLabel={t("apps.ipod.menu.play")}
      pauseLabel={t("apps.ipod.menu.pause")}
      previousLabel={t("apps.ipod.menu.previous")}
      nextLabel={t("apps.ipod.menu.next")}
      shuffleLabel={t("apps.ipod.menu.shuffle")}
      repeatAllLabel={t("apps.ipod.menu.repeatAll")}
      repeatOneLabel={t("apps.ipod.menu.repeatOne")}
      isShuffled={isShuffled}
      onToggleShuffle={() => toggleShuffle()}
      isLoopAll={isLoopAll}
      onToggleLoopAll={() => toggleLoopAll()}
      isLoopCurrent={isLoopCurrent}
      onToggleLoopCurrent={() => toggleLoopCurrent()}
    />
  );
}
