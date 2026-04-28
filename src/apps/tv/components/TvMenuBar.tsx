import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import type { Channel } from "@/apps/tv/data/channels";

interface TvMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  channels: Channel[];
  currentChannelId: string;
  onSelectChannel: (id: string) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextVideo: () => void;
  onPrevVideo: () => void;
  onNextChannel: () => void;
  onPrevChannel: () => void;
  onFullScreen: () => void;
}

export function TvMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  channels,
  currentChannelId,
  onSelectChannel,
  isPlaying,
  onTogglePlay,
  onNextVideo,
  onPrevVideo,
  onNextChannel,
  onPrevChannel,
  onFullScreen,
}: TvMenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.tv.menu.controls")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onTogglePlay} className="text-md h-6 px-3">
            {isPlaying ? t("apps.tv.menu.pause") : t("apps.tv.menu.play")}
          </MenubarItem>
          <MenubarItem onClick={onPrevVideo} className="text-md h-6 px-3">
            {t("apps.tv.menu.previous")}
          </MenubarItem>
          <MenubarItem onClick={onNextVideo} className="text-md h-6 px-3">
            {t("apps.tv.menu.next")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onPrevChannel} className="text-md h-6 px-3">
            {t("apps.tv.menu.channelDown")}
          </MenubarItem>
          <MenubarItem onClick={onNextChannel} className="text-md h-6 px-3">
            {t("apps.tv.menu.channelUp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onFullScreen} className="text-md h-6 px-3">
            {t("apps.tv.menu.fullScreen")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.tv.menu.channels")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarRadioGroup
            value={currentChannelId}
            onValueChange={onSelectChannel}
          >
            {channels.map((ch) => (
              <MenubarRadioItem
                key={ch.id}
                value={ch.id}
                className="text-md h-6 px-3"
              >
                {String(ch.number).padStart(2, "0")} {ch.name}
              </MenubarRadioItem>
            ))}
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.tv.menu.tvHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.tv.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
