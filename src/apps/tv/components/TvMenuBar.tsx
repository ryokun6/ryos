import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
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
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("tv");

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.tv.menu.newChannel"),
          onClick: onCreateChannel,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.tv.menu.exportChannels"),
          onClick: onExportChannels,
          disabled: !hasCustomChannels,
        },
        {
          type: "action",
          label: t("apps.tv.menu.importChannels"),
          onClick: onImportChannels,
        },
        { type: "separator" },
        { type: "action", label: t("common.menu.close"), onClick: onClose },
      ],
    },
    {
      label: t("apps.tv.menu.controls"),
      items: [
        {
          type: "action",
          label: isPlaying ? t("apps.tv.menu.pause") : t("apps.tv.menu.play"),
          onClick: onTogglePlay,
        },
        {
          type: "action",
          label: t("apps.tv.menu.previous"),
          onClick: onPrevVideo,
        },
        { type: "action", label: t("apps.tv.menu.next"), onClick: onNextVideo },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.tv.menu.channelDown"),
          onClick: onPrevChannel,
        },
        {
          type: "action",
          label: t("apps.tv.menu.channelUp"),
          onClick: onNextChannel,
        },
        { type: "separator" },
        {
          type: "checkbox",
          label: t("apps.tv.menu.showVideos"),
          checked: isDrawerOpen,
          onChange: onToggleDrawer,
        },
        {
          type: "checkbox",
          label: t("apps.tv.menu.lcdFilter"),
          checked: isLcdFilterOn,
          onChange: onToggleLcdFilter,
        },
        {
          type: "checkbox",
          label: t("apps.tv.menu.closedCaptions"),
          checked: closedCaptionsOn,
          onChange: onToggleClosedCaptions,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.tv.menu.fullScreen"),
          onClick: onFullScreen,
        },
      ],
    },
    {
      label: t("apps.tv.menu.channels"),
      items: [
        {
          type: "radioGroup",
          value: currentChannelId,
          onValueChange: onSelectChannel,
          options: channels.map((ch) => ({
            value: ch.id,
            label: `${String(ch.number).padStart(2, "0")} ${ch.name}`,
          })),
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.tv.menu.newChannel"),
          onClick: onCreateChannel,
        },
        {
          type: "action",
          label: t("apps.tv.menu.deleteChannel"),
          onClick: () => onDeleteChannel(currentChannelId),
          disabled: channels.length <= 1,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.tv.menu.resetChannels"),
          onClick: onResetChannels,
          disabled: !canResetChannels,
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.tv.menu.tvHelp")}
      aboutItemLabel={t("apps.tv.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
