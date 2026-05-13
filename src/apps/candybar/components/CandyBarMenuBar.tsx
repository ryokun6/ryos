import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslation } from "react-i18next";

interface CandyBarMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onRefresh: () => void;
  onAddPack: () => void;
  onSyncLibrary: () => void;
  onClearLibrary: () => void;
}

export function CandyBarMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onRefresh,
  onAddPack,
  onSyncLibrary,
  onClearLibrary,
}: CandyBarMenuBarProps) {
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
          <MenubarItem onClick={onRefresh} className="text-md h-6 px-3">
            {t("apps.candybar.menu.refresh")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.candybar.menu.library")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onAddPack} className="text-md h-6 px-3">
            {t("apps.candybar.menu.addToLibrary")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onSyncLibrary} className="text-md h-6 px-3">
            {t("apps.candybar.menu.syncLibrary")}
          </MenubarItem>
          <MenubarItem onClick={onClearLibrary} className="text-md h-6 px-3">
            {t("apps.candybar.menu.clearLibrary")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.candybar.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.candybar.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
