import { MediaControlsMenu } from "@/components/shared/menubar/MediaControlsMenu";
import { MENUBAR_TRIGGER_CLASS } from "@/components/shared/menubar/menubarStyles";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarControlsMenu({
  vm,
}: {
  vm: KaraokeMenuBarViewModel;
}) {
  const {
    t,
    tracks,
    onTogglePlay,
    onPreviousTrack,
    onNextTrack,
    isPlaying,
    isShuffled,
    onToggleShuffle,
    loopAll,
    onToggleLoopAll,
    loopCurrent,
    onToggleLoopCurrent,
  } = vm;

  return (
    <MediaControlsMenu
      menuLabel={t("apps.karaoke.menu.controls")}
      triggerClassName={MENUBAR_TRIGGER_CLASS}
      tracksCount={tracks.length}
      isPlaying={isPlaying}
      onTogglePlay={onTogglePlay}
      onPreviousTrack={onPreviousTrack}
      onNextTrack={onNextTrack}
      playLabel={t("apps.ipod.menu.play")}
      pauseLabel={t("apps.ipod.menu.pause")}
      previousLabel={t("apps.karaoke.menu.previous")}
      nextLabel={t("apps.karaoke.menu.next")}
      shuffleLabel={t("apps.karaoke.menu.shuffle")}
      repeatAllLabel={t("apps.karaoke.menu.repeatAll")}
      repeatOneLabel={t("apps.karaoke.menu.repeatOne")}
      isShuffled={isShuffled}
      onToggleShuffle={onToggleShuffle}
      isLoopAll={loopAll}
      onToggleLoopAll={onToggleLoopAll}
      isLoopCurrent={loopCurrent}
      onToggleLoopCurrent={onToggleLoopCurrent}
    />
  );
}
