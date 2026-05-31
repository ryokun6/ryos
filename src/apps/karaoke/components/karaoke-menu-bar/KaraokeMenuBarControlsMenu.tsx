import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
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
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("apps.karaoke.menu.controls")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MenubarItem
          onClick={onTogglePlay}
          className="text-md h-6 px-3"
          disabled={tracks.length === 0}
        >
          {isPlaying ? t("apps.ipod.menu.pause") : t("apps.ipod.menu.play")}
        </MenubarItem>
        <MenubarItem
          onClick={onPreviousTrack}
          className="text-md h-6 px-3"
          disabled={tracks.length === 0}
        >
          {t("apps.karaoke.menu.previous")}
        </MenubarItem>
        <MenubarItem
          onClick={onNextTrack}
          className="text-md h-6 px-3"
          disabled={tracks.length === 0}
        >
          {t("apps.karaoke.menu.next")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarCheckboxItem
          checked={isShuffled}
          onCheckedChange={onToggleShuffle}
          className="text-md h-6 px-3"
        >
          {t("apps.karaoke.menu.shuffle")}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={loopAll}
          onCheckedChange={onToggleLoopAll}
          className="text-md h-6 px-3"
        >
          {t("apps.karaoke.menu.repeatAll")}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={loopCurrent}
          onCheckedChange={onToggleLoopCurrent}
          className="text-md h-6 px-3"
        >
          {t("apps.karaoke.menu.repeatOne")}
        </MenubarCheckboxItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
