import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import { MENUBAR_SEPARATOR_CLASS } from "@/components/shared/menubar/menubarStyles";
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
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onClear}
            className="text-md h-6 px-3"
          >
            {t("apps.terminal.menu.clearTerminal")}
          </MenubarItem>
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
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.copy")}
          </MenubarItem>
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.paste")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.selectAll")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onIncreaseFontSize}
            className="text-md h-6 px-3"
          >
            {t("apps.terminal.menu.increaseFontSize")}
          </MenubarItem>
          <MenubarItem
            onClick={onDecreaseFontSize}
            className="text-md h-6 px-3"
          >
            {t("apps.terminal.menu.decreaseFontSize")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={onResetFontSize}
            className="text-md h-6 px-3"
          >
            {t("apps.terminal.menu.resetFontSize")}
          </MenubarItem>
          {onToggleMute && (
            <>
              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
              <MenubarCheckboxItem
                checked={isMuted}
                onCheckedChange={(checked) => {
                  if (checked !== isMuted) onToggleMute();
                }}
                className="text-md h-6 px-3"
              >
                {t("apps.terminal.menu.muteSounds")}
              </MenubarCheckboxItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>

    </AppMenuBarShell>
  );
}
