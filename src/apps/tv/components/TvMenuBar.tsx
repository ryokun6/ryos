import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarSeparator,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslation } from "react-i18next";
import type { Channel } from "@/apps/tv/data/channels";

interface TvMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  channels: Channel[];
  canResetChannels: boolean;
  hasCustomChannels: boolean;
  currentChannelId: string;
  onSelectChannel: (id: string) => void;
  onCreateChannel: () => void;
  onDeleteChannel: (id: string) => void;
  onImportChannels: () => void;
  onExportChannels: () => void;
  onResetChannels: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextVideo: () => void;
  onPrevVideo: () => void;
  onNextChannel: () => void;
  onPrevChannel: () => void;
  onFullScreen: () => void;
  isLcdFilterOn: boolean;
  onToggleLcdFilter: () => void;
  closedCaptionsOn: boolean;
  onToggleClosedCaptions: () => void;
  isDrawerOpen: boolean;
  onToggleDrawer: () => void;
}

export function TvMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  channels,
  canResetChannels,
  hasCustomChannels,
  currentChannelId,
  onSelectChannel,
  onCreateChannel,
  onDeleteChannel,
  onImportChannels,
  onExportChannels,
  onResetChannels,
  isPlaying,
  onTogglePlay,
  onNextVideo,
  onPrevVideo,
  onNextChannel,
  onPrevChannel,
  onFullScreen,
  isLcdFilterOn,
  onToggleLcdFilter,
  closedCaptionsOn,
  onToggleClosedCaptions,
  isDrawerOpen,
  onToggleDrawer,
}: TvMenuBarProps) {
  const { t } = useTranslation();
  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacOsxTheme } =
    useThemeFlags();

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onCreateChannel} className="text-md h-6 px-3">
            {t("apps.tv.menu.newChannel")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onExportChannels}
            disabled={!hasCustomChannels}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.exportChannels")}
          </MenubarItem>
          <MenubarItem
            onClick={onImportChannels}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.importChannels")}
          </MenubarItem>
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
          <MenubarCheckboxItem
            checked={isDrawerOpen}
            onCheckedChange={onToggleDrawer}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.showVideos")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={isLcdFilterOn}
            onCheckedChange={onToggleLcdFilter}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.lcdFilter")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={closedCaptionsOn}
            onCheckedChange={onToggleClosedCaptions}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.closedCaptions")}
          </MenubarCheckboxItem>
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onCreateChannel} className="text-md h-6 px-3">
            {t("apps.tv.menu.newChannel")}
          </MenubarItem>
          <MenubarItem
            onClick={() => onDeleteChannel(currentChannelId)}
            disabled={channels.length <= 1}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.deleteChannel")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onResetChannels}
            disabled={!canResetChannels}
            className="text-md h-6 px-3"
          >
            {t("apps.tv.menu.resetChannels")}
          </MenubarItem>
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
