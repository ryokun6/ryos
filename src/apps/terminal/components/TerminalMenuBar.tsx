import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { useAppMenuBar } from "@/hooks/useAppMenuBar";

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
  const appId = "terminal";
  const {
    t,
    appName,
    isXpTheme,
    isMacOsxTheme,
    isShareDialogOpen,
    setIsShareDialogOpen,
  } = useAppMenuBar(appId);

  return (
    <MenuBar inWindowFrame={isXpTheme}>
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
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
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onResetFontSize}
            className="text-md h-6 px-3"
          >
            {t("apps.terminal.menu.resetFontSize")}
          </MenubarItem>
          {onToggleMute && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
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
            {t("apps.terminal.menu.terminalHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.terminal.menu.aboutTerminal")}
              </MenubarItem>
            </>
          )}
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
