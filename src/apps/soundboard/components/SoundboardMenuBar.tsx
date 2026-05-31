import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppProps } from "../../base/types";
import { useState, useEffect } from "react";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
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
    isXpTheme,
    isMacOsxTheme,
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

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.soundboard.menu.soundboardHelp")}
      aboutItemLabel={t("apps.soundboard.menu.aboutSoundboard")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onNewBoard}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.newSoundboard")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onImportBoard}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.importSoundboards")}
          </MenubarItem>
          <MenubarItem
            onClick={onExportBoard}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.exportSoundboards")}
          </MenubarItem>
          <MenubarItem
            onClick={onReloadBoard}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.resetSoundboards")}
          </MenubarItem>
          {isOptionPressed && (
            <MenubarItem
              onClick={onReloadAllSounds}
              className="text-md h-6 px-3"
            >
              {t("apps.soundboard.menu.loadSpecialSoundboards")}
            </MenubarItem>
          )}
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onRenameBoard}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.renameSoundboard")}
          </MenubarItem>
          <MenubarItem
            onClick={onDeleteBoard}
            disabled={!canDeleteBoard}
            className={
              !canDeleteBoard
                ? "text-neutral-400 text-md h-6 px-3"
                : "text-md h-6 px-3"
            }
          >
            {t("apps.soundboard.menu.deleteSoundboard")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={showWaveforms ?? false}
            onCheckedChange={(checked) => onToggleWaveforms?.(checked)}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.waveforms")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={showEmojis ?? false}
            onCheckedChange={(checked) => onToggleEmojis?.(checked)}
            className="text-md h-6 px-3"
          >
            {t("apps.soundboard.menu.emojis")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
