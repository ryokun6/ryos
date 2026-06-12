import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
  type MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";

export interface TerminalMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClear: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onResetFontSize: () => void;
  onToggleMute?: () => void;
  isMuted?: boolean;
}

export function TerminalMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClear,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onResetFontSize,
  onToggleMute,
  isMuted = false,
}: TerminalMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("terminal");

  const muteItems: MenuItemDescriptor[] = onToggleMute
    ? [
        { type: "separator" },
        {
          type: "checkbox",
          label: t("apps.terminal.menu.muteSounds"),
          checked: isMuted,
          onChange: (checked) => {
            if (checked !== isMuted) onToggleMute();
          },
        },
      ]
    : [];

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.terminal.menu.clearTerminal"),
          onClick: onClear,
        },
        { type: "separator" },
        { type: "action", label: t("common.menu.close"), onClick: onClose },
      ],
    },
    {
      label: t("common.menu.edit"),
      items: [
        { type: "action", label: t("common.menu.copy"), onClick: () => {} },
        { type: "action", label: t("common.menu.paste"), onClick: () => {} },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.selectAll"),
          onClick: () => {},
        },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        {
          type: "action",
          label: t("apps.terminal.menu.increaseFontSize"),
          onClick: onIncreaseFontSize,
        },
        {
          type: "action",
          label: t("apps.terminal.menu.decreaseFontSize"),
          onClick: onDecreaseFontSize,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.terminal.menu.resetFontSize"),
          onClick: onResetFontSize,
        },
        ...muteItems,
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
      helpItemLabel={t("apps.terminal.menu.terminalHelp")}
      aboutItemLabel={t("apps.terminal.menu.aboutTerminal")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
