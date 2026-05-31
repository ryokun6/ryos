import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { MediaLyricsViewMenuItems } from "@/components/shared/menubar/MediaLyricsViewMenuItems";
import { MENUBAR_SEPARATOR_CLASS, MENUBAR_TRIGGER_CLASS } from "@/components/shared/menubar/menubarStyles";
import type { KaraokeMenuBarViewModel } from "./useKaraokeMenuBar";

export function KaraokeMenuBarViewMenu({ vm }: { vm: KaraokeMenuBarViewModel }) {
  return (
    <MenubarMenu>
      <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
        {vm.t("apps.karaoke.menu.view")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        <MediaLyricsViewMenuItems
          t={vm.t}
          showLyricsLabel={vm.t("apps.karaoke.menu.showLyrics")}
          showLyrics={vm.showLyrics}
          onToggleLyrics={vm.onToggleLyrics}
          lyricsAlignment={vm.lyricsAlignment}
          setLyricsAlignment={vm.setLyricsAlignment}
          lyricsFont={vm.lyricsFont}
          setLyricsFont={vm.setLyricsFont}
          romanization={vm.romanization}
          setRomanization={vm.setRomanization}
          lyricsTranslationLanguage={vm.lyricsTranslationLanguage}
          setLyricsTranslationLanguage={vm.setLyricsTranslationLanguage}
          translationLanguages={vm.translationLanguages}
          displayMode={vm.displayMode}
          setDisplayMode={vm.setDisplayMode}
          onRefreshLyrics={vm.onRefreshLyrics || vm.refreshLyrics}
          onAdjustTiming={vm.onAdjustTiming}
          clearLyricsCache={vm.clearLyricsCache}
          tracks={vm.tracks}
          currentIndex={vm.currentIndex}
          debugMode={vm.debugMode}
          isAdmin={vm.isAdmin}
        />

        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

        <MenubarItem
          onClick={vm.onToggleCoverFlow}
          className="text-md h-6 px-3"
          disabled={vm.tracks.length === 0}
        >
          {vm.t("apps.ipod.menu.coverFlow")}
        </MenubarItem>
        <MenubarItem
          onClick={vm.onToggleFullScreen}
          className="text-md h-6 px-3"
        >
          {vm.t("apps.ipod.menu.fullScreen")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
