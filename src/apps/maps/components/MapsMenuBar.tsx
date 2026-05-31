import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { cn } from "@/lib/utils";
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
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("maps");

  return (
    <AppMenuBarShell
      isXpTheme={isXpTheme}
      isMacOsxTheme={isMacOsxTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.maps.menu.help")}
      aboutItemLabel={t("apps.maps.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onLocateMe}
            disabled={!canUseMap}
            className={cn(
              MENUBAR_ITEM_CLASS,
              !canUseMap ? "text-neutral-500" : "",
            )}
          >
            {t("apps.maps.menu.locateMe")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem onClick={onClose} className={MENUBAR_ITEM_CLASS}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={mapType === "standard"}
            onClick={() => onSetMapType("standard")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.maps.menu.standard")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={mapType === "hybrid"}
            onClick={() => onSetMapType("hybrid")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.maps.menu.hybrid")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={mapType === "satellite"}
            onClick={() => onSetMapType("satellite")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.maps.menu.satellite")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={mapType === "mutedStandard"}
            onClick={() => onSetMapType("mutedStandard")}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.maps.menu.mutedStandard")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
