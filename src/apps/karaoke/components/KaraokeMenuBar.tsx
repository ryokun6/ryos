import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { appMetadata } from "..";
import { useTranslation } from "react-i18next";
import { useIpodStore } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";

interface KaraokeMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
}

export function KaraokeMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
}: KaraokeMenuBarProps) {
  const { t } = useTranslation();

  const {
    toggleLyrics,
    showLyrics,
    toggleShuffle,
    isShuffled,
    toggleLoopCurrent,
    loopCurrent,
    toggleLoopAll,
    loopAll,
  } = useIpodStore(
    useShallow((s) => ({
      toggleLyrics: s.toggleLyrics,
      showLyrics: s.showLyrics,
      toggleShuffle: s.toggleShuffle,
      isShuffled: s.isShuffled,
      toggleLoopCurrent: s.toggleLoopCurrent,
      loopCurrent: s.loopCurrent,
      toggleLoopAll: s.toggleLoopAll,
      loopAll: s.loopAll,
    }))
  );

  return (
    <Menubar className="border-b">
      {/* App Menu */}
      <MenubarMenu>
        <MenubarTrigger className="font-bold">{appMetadata.name}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onShowAbout}>
            {t("menuBar.appMenu.about")} {appMetadata.name}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={onClose}>
            {t("menuBar.appMenu.quit")} {appMetadata.name}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Controls Menu */}
      <MenubarMenu>
        <MenubarTrigger>{t("apps.ipod.menu.controls")}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={() => useIpodStore.getState().previousTrack()}>
            {t("apps.ipod.menu.previous")}
          </MenubarItem>
          <MenubarItem onClick={() => useIpodStore.getState().togglePlay()}>
            {t("apps.ipod.menu.playPause")}
          </MenubarItem>
          <MenubarItem onClick={() => useIpodStore.getState().nextTrack()}>
            {t("apps.ipod.menu.next")}
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem onClick={toggleShuffle}>
            {isShuffled ? "✓ " : ""}{t("apps.ipod.menu.shuffle")}
          </MenubarItem>
          <MenubarItem onClick={toggleLoopCurrent}>
            {loopCurrent ? "✓ " : ""}{t("apps.ipod.menu.repeatOne")}
          </MenubarItem>
          <MenubarItem onClick={toggleLoopAll}>
            {loopAll ? "✓ " : ""}{t("apps.ipod.menu.repeatAll")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger>{t("apps.ipod.menu.view")}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={toggleLyrics}>
            {showLyrics ? "✓ " : ""}{t("apps.ipod.menu.showLyrics")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger>{t("common.menu.help")}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onShowHelp}>
            {appMetadata.name} {t("common.menu.help")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
