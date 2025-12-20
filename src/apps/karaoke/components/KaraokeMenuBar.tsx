import { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";

interface KaraokeMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  // Playback controls (independent from iPod)
  onTogglePlay: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  loopAll: boolean;
  onToggleLoopAll: () => void;
  loopCurrent: boolean;
  onToggleLoopCurrent: () => void;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
}

export function KaraokeMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onTogglePlay,
  onPreviousTrack,
  onNextTrack,
  isShuffled,
  onToggleShuffle,
  loopAll,
  onToggleLoopAll,
  loopCurrent,
  onToggleLoopCurrent,
  showLyrics,
  onToggleLyrics,
  isFullScreen,
  onToggleFullScreen,
}: KaraokeMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "karaoke";
  const appName = t("apps.karaoke.name");

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.karaoke.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Controls Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.karaoke.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onTogglePlay}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.playPause")}
          </MenubarItem>
          <MenubarItem
            onClick={onPreviousTrack}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.previous")}
          </MenubarItem>
          <MenubarItem
            onClick={onNextTrack}
            className="text-md h-6 px-3"
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

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.karaoke.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={showLyrics}
            onCheckedChange={onToggleLyrics}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.showLyrics")}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={isFullScreen}
            onCheckedChange={onToggleFullScreen}
            className="text-md h-6 px-3"
          >
            {t("apps.ipod.menu.fullScreen")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.karaokeHelp")}
          </MenubarItem>
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.shareApp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onShowAbout}
            className="text-md h-6 px-3"
          >
            {t("apps.karaoke.menu.aboutKaraoke")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
