import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";

interface StuffMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onAddItem: () => void;
  onScan: () => void;
  onShare: () => void;
  onPrintItemLabels: () => void;
  onPrintTagLabels: () => void;
  canPrintItems: boolean;
  canPrintTags: boolean;
  isSharedView: boolean;
  onBackFromShare?: () => void;
}

export function StuffMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onAddItem,
  onScan,
  onShare,
  onPrintItemLabels,
  onPrintTagLabels,
  canPrintItems,
  canPrintTags,
  isSharedView,
  onBackFromShare,
}: StuffMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("stuff");

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: isSharedView
        ? [
            {
              type: "action",
              label: t("apps.stuff.menu.backToShelf", {
                defaultValue: "Back to My Shelf",
              }),
              onClick: () => onBackFromShare?.(),
            },
            { type: "separator" },
            {
              type: "action",
              label: t("common.menu.close"),
              onClick: onClose,
              shortcutId: "close",
            },
          ]
        : [
            {
              type: "action",
              label: t("apps.stuff.menu.newItem", {
                defaultValue: "New Item",
              }),
              onClick: onAddItem,
              shortcutId: "newFile",
            },
            {
              type: "action",
              label: t("apps.stuff.menu.scanBarcode", {
                defaultValue: "Scan Barcode…",
              }),
              onClick: onScan,
            },
            {
              type: "action",
              label: t("apps.stuff.menu.share", {
                defaultValue: "Share Shelf…",
              }),
              onClick: onShare,
            },
            {
              type: "action",
              label: t("apps.stuff.menu.printItemLabels", {
                defaultValue: "Print Item Labels…",
              }),
              onClick: onPrintItemLabels,
              disabled: !canPrintItems,
            },
            {
              type: "action",
              label: t("apps.stuff.menu.printTagLabels", {
                defaultValue: "Print Tag Labels…",
              }),
              onClick: onPrintTagLabels,
              disabled: !canPrintTags,
            },
            { type: "separator" },
            {
              type: "action",
              label: t("common.menu.close"),
              onClick: onClose,
              shortcutId: "close",
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
      helpItemLabel={t("apps.stuff.menu.help", { defaultValue: "Stuff Help" })}
      aboutItemLabel={t("apps.stuff.menu.about", {
        defaultValue: "About Stuff",
      })}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
