import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { MediaLyricsViewMenuItems } from "@/components/shared/menubar/MediaLyricsViewMenuItems";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
import type { IpodMenuBarViewModel } from "./useIpodMenuBar";

export function IpodMenuBarViewMenu({ vm }: { vm: IpodMenuBarViewModel }) {
  return (
    <>
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {vm.t("apps.ipod.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MediaLyricsViewMenuItems
            t={vm.t}
            showLyricsLabel={vm.t("apps.ipod.menu.showLyrics")}
            showLyrics={vm.showLyrics}
            onToggleLyrics={() => vm.toggleLyrics()}
            lyricsAlignment={vm.lyricsAlignment}
            setLyricsAlignment={vm.setLyricsAlignment}
            lyricsFont={vm.lyricsFont}
            setLyricsFont={vm.setLyricsFont}
            romanization={vm.romanization}
            setRomanization={vm.setRomanization}
            lyricsTranslationLanguage={vm.lyricsTranslationLanguage}
            setLyricsTranslationLanguage={vm.setLyricsTranslationLanguage}
            translationLanguages={vm.translationLanguages}
            displayMode={vm.effectiveDisplayMode}
            setDisplayMode={vm.setDisplayMode}
            hideVideoOption={vm.isAppleMusic}
            onRefreshLyrics={vm.onRefreshLyrics || vm.refreshLyrics}
            onAdjustTiming={vm.onAdjustTiming}
            clearLyricsCache={vm.clearLyricsCache}
            tracks={vm.tracks}
            currentIndex={vm.currentIndex}
            debugMode={vm.debugMode}
            isAdmin={vm.isAdmin}
          />

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.backlight")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={vm.backlightTimeout}
                onValueChange={(value) => {
                  const timeout = value as "2s" | "10s" | "always-on" | "off";
                  vm.setBacklightTimeout(timeout);
                  if (timeout === "off" && vm.isBacklightOn) {
                    vm.toggleBacklight();
                  } else if (
                    (timeout === "2s" || timeout === "10s" || timeout === "always-on") &&
                    !vm.isBacklightOn
                  ) {
                    vm.toggleBacklight();
                  }
                }}
              >
                <MenubarRadioItem value="2s" className="text-md h-6 pr-3">
                  2s
                </MenubarRadioItem>
                <MenubarRadioItem value="10s" className="text-md h-6 pr-3">
                  10s
                </MenubarRadioItem>
                <MenubarRadioItem value="always-on" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menuItems.alwaysOn", "Keep On")}
                </MenubarRadioItem>
                <MenubarRadioItem value="off" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menuItems.off")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.uiTheme")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={vm.uiVariant}
                onValueChange={(value) =>
                  vm.setUiVariant(value as "classic" | "modern" | "aqua")
                }
              >
                <MenubarRadioItem value="classic" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.screenClassic")}
                </MenubarRadioItem>
                <MenubarRadioItem value="modern" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.screenModern")}
                </MenubarRadioItem>
                <MenubarRadioItem value="aqua" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.screenAqua", "Aqua Glass")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {vm.t("apps.ipod.menu.deviceTheme")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarRadioGroup
                value={vm.currentTheme}
                onValueChange={(value) =>
                  vm.setTheme(value as "classic" | "black" | "u2")
                }
              >
                <MenubarRadioItem value="classic" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.classic")}
                </MenubarRadioItem>
                <MenubarRadioItem value="black" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.black")}
                </MenubarRadioItem>
                <MenubarRadioItem value="u2" className="text-md h-6 pr-3">
                  {vm.t("apps.ipod.menu.u2")}
                </MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />

          <MenubarItem
            onClick={() => vm.onToggleCoverFlow?.()}
            className="text-md h-6 px-3"
            disabled={vm.tracks.length === 0}
          >
            {vm.t("apps.ipod.menu.coverFlow")}
          </MenubarItem>
          <MenubarItem
            onClick={() => vm.toggleFullScreen()}
            className="text-md h-6 px-3"
          >
            {vm.t("apps.ipod.menu.fullScreen")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </>
  );
}
