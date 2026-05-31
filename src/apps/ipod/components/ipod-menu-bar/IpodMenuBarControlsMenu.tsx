import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarControlsMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  const {
    t, tracks, isPlaying, togglePlay, previousTrack, nextTrack,
    isShuffled, toggleShuffle, isLoopAll, toggleLoopAll, isLoopCurrent, toggleLoopCurrent,
  } = vm;
  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("apps.ipod.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={togglePlay}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {isPlaying ? t("apps.ipod.menu.pause") : t("apps.ipod.menu.play")}
          </MenubarItem>
          <MenubarItem
            onClick={previousTrack}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.ipod.menu.previous")}
          </MenubarItem>
          <MenubarItem
            onClick={nextTrack}
            className="text-md h-6 px-3"
            disabled={tracks.length === 0}
          >
            {t("apps.ipod.menu.next")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={isShuffled}
            onCheckedChange={() => toggleShuffle()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.shuffle")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLoopAll}
            onCheckedChange={() => toggleLoopAll()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.repeatAll")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLoopCurrent}
            onCheckedChange={() => toggleLoopCurrent()}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.repeatOne")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
