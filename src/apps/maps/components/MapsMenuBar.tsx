import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
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

const MAP_TYPES: Array<{ type: MapsMapType; labelKey: string }> = [
  { type: "standard", labelKey: "apps.maps.menu.standard" },
  { type: "hybrid", labelKey: "apps.maps.menu.hybrid" },
  { type: "satellite", labelKey: "apps.maps.menu.satellite" },
  { type: "mutedStandard", labelKey: "apps.maps.menu.mutedStandard" },
];

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

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.maps.menu.locateMe"),
          onClick: onLocateMe,
          disabled: !canUseMap,
          className: !canUseMap ? "text-neutral-500" : undefined,
        },
        { type: "separator" },
        { type: "action", label: t("common.menu.close"), onClick: onClose },
      ],
    },
    {
      label: t("common.menu.view"),
      // Checkbox items (not a radio group) to match the original rendering.
      items: MAP_TYPES.map(({ type, labelKey }) => ({
        type: "checkbox" as const,
        label: t(labelKey),
        checked: mapType === type,
        onChange: () => onSetMapType(type),
      })),
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
      helpItemLabel={t("apps.maps.menu.help")}
      aboutItemLabel={t("apps.maps.menu.about")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
