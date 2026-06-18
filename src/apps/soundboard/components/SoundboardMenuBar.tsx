import { AppProps } from "../../base/types";
import { useState, useEffect } from "react";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
  type MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";

interface SoundboardMenuBarProps extends Omit<AppProps, "onClose" | "instanceId"> {
  onClose: () => void;
  onNewBoard?: () => void;
  onImportBoard?: () => void;
  onExportBoard?: () => void;
  onReloadBoard?: () => void;
  onReloadAllSounds?: () => void;
  onRenameBoard?: () => void;
  onDeleteBoard?: () => void;
  canDeleteBoard?: boolean;
  onShowHelp?: () => void;
  onShowAbout?: () => void;
  showWaveforms?: boolean;
  onToggleWaveforms?: (show: boolean) => void;
  showEmojis?: boolean;
  onToggleEmojis?: (show: boolean) => void;
}

export function SoundboardMenuBar({
  onNewBoard,
  onImportBoard,
  onExportBoard,
  onReloadBoard,
  onReloadAllSounds,
  onRenameBoard,
  onDeleteBoard,
  canDeleteBoard,
  onShowHelp,
  onShowAbout,
  showWaveforms,
  onToggleWaveforms,
  showEmojis,
  onToggleEmojis,
  onClose,
}: SoundboardMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("soundboard");
  const [isOptionPressed, setIsOptionPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsOptionPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        setIsOptionPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const specialSoundboardsItems: MenuItemDescriptor[] = isOptionPressed
    ? [
        {
          type: "action",
          label: t("apps.soundboard.menu.loadSpecialSoundboards"),
          onClick: () => onReloadAllSounds?.(),
        },
      ]
    : [];

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.soundboard.menu.newSoundboard"),
          onClick: () => onNewBoard?.(),
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.soundboard.menu.importSoundboards"),
          onClick: () => onImportBoard?.(),
        },
        {
          type: "action",
          label: t("apps.soundboard.menu.exportSoundboards"),
          onClick: () => onExportBoard?.(),
        },
        {
          type: "action",
          label: t("apps.soundboard.menu.resetSoundboards"),
          onClick: () => onReloadBoard?.(),
        },
        ...specialSoundboardsItems,
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
    {
      label: t("common.menu.edit"),
      items: [
        {
          type: "action",
          label: t("apps.soundboard.menu.renameSoundboard"),
          onClick: () => onRenameBoard?.(),
        },
        {
          type: "action",
          label: t("apps.soundboard.menu.deleteSoundboard"),
          onClick: () => onDeleteBoard?.(),
          disabled: !canDeleteBoard,
          className: !canDeleteBoard ? "text-neutral-400" : undefined,
        },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        {
          type: "checkbox",
          label: t("apps.soundboard.menu.waveforms"),
          checked: showWaveforms ?? false,
          onChange: (checked) => onToggleWaveforms?.(checked),
        },
        {
          type: "checkbox",
          label: t("apps.soundboard.menu.emojis"),
          checked: showEmojis ?? false,
          onChange: (checked) => onToggleEmojis?.(checked),
        },
      ],
    },
  ];

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.soundboard.menu.soundboardHelp")}
      aboutItemLabel={t("apps.soundboard.menu.aboutSoundboard")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
