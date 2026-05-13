import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslation } from "react-i18next";
import type { MapsMapType } from "../hooks/useMapsLogic";

interface MapsMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onLocateMe: () => void;
  mapType: MapsMapType;
  onSetMapType: (type: MapsMapType) => void;
  canUseMap: boolean;
}

export function MapsMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onLocateMe,
  mapType,
  onSetMapType,
  canUseMap,
}: MapsMenuBarProps) {
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
          <MenubarItem
            onClick={onLocateMe}
            disabled={!canUseMap}
            className={`text-md h-6 px-3 ${!canUseMap ? "text-gray-500" : ""}`}
          >
            {t("apps.maps.menu.locateMe")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={mapType === "standard"}
            onClick={() => onSetMapType("standard")}
            className="text-md h-6 px-3"
          >
            {t("apps.maps.menu.standard")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={mapType === "hybrid"}
            onClick={() => onSetMapType("hybrid")}
            className="text-md h-6 px-3"
          >
            {t("apps.maps.menu.hybrid")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={mapType === "satellite"}
            onClick={() => onSetMapType("satellite")}
            className="text-md h-6 px-3"
          >
            {t("apps.maps.menu.satellite")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={mapType === "mutedStandard"}
            onClick={() => onSetMapType("mutedStandard")}
            className="text-md h-6 px-3"
          >
            {t("apps.maps.menu.mutedStandard")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.maps.menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.maps.menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
