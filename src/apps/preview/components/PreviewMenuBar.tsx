import { useTranslation } from "react-i18next";
import type { AppId } from "@/config/appRegistry";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { getTranslatedAppName } from "@/utils/i18n";

interface PreviewMenuBarProps {
  onClose: () => void;
  onOpen: () => void;
  onSaveAs: () => void;
  onImport: () => void;
  onExport: () => void;
  hasDocument: boolean;
  onOpenWith: (appId: AppId) => void;
  openWithApps: AppId[];
  onShowHelp: () => void;
  onShowAbout: () => void;
  isImage: boolean;
  zoom: number;
  onSetZoom: (zoom: number) => void;
  fitToWindow: boolean;
  onSetFitToWindow: (fit: boolean) => void;
}

export function PreviewMenuBar({
  onClose,
  onOpen,
  onSaveAs,
  onImport,
  onExport,
  hasDocument,
  onOpenWith,
  openWithApps,
  onShowHelp,
  onShowAbout,
  isImage,
  zoom,
  onSetZoom,
  fitToWindow,
  onSetFitToWindow,
}: PreviewMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("preview");

  const fileMenu: MenuDescriptor = {
    label: t("common.menu.file"),
    items: [
      {
        type: "action",
        label: t("apps.preview.menu.open"),
        onClick: onOpen,
        shortcutId: "open",
      },
      {
        type: "submenu",
        label: t("apps.preview.menu.openWith"),
        disabled: openWithApps.length === 0,
        items: openWithApps.map((targetAppId) => ({
          type: "action",
          label: getTranslatedAppName(targetAppId),
          onClick: () => onOpenWith(targetAppId),
        })),
      },
      { type: "separator" },
      {
        type: "action",
        label: t("apps.preview.menu.saveAs"),
        onClick: onSaveAs,
        disabled: !hasDocument,
      },
      { type: "separator" },
      {
        type: "action",
        label: t("apps.preview.menu.importFromDevice"),
        onClick: onImport,
      },
      {
        type: "action",
        label: t("apps.preview.menu.export"),
        onClick: onExport,
        disabled: !hasDocument,
      },
      { type: "separator" },
      {
        type: "action",
        label: t("common.menu.close"),
        onClick: onClose,
        shortcutId: "close",
      },
    ],
  };

  const viewMenu: MenuDescriptor = {
    label: t("common.menu.view"),
    items: [
      {
        type: "action",
        label: t("apps.preview.menu.zoomIn"),
        onClick: () => {
          onSetFitToWindow(false);
          onSetZoom(Math.min(400, zoom + 25));
        },
        disabled: !isImage || zoom >= 400,
        shortcut: "+",
      },
      {
        type: "action",
        label: t("apps.preview.menu.zoomOut"),
        onClick: () => {
          onSetFitToWindow(false);
          onSetZoom(Math.max(25, zoom - 25));
        },
        disabled: !isImage || zoom <= 25,
        shortcut: "−",
      },
      {
        type: "action",
        label: t("apps.preview.menu.actualSize"),
        onClick: () => {
          onSetFitToWindow(false);
          onSetZoom(100);
        },
        disabled: !isImage || (!fitToWindow && zoom === 100),
      },
      {
        type: "checkbox",
        label: t("apps.preview.menu.fitToWindow"),
        checked: fitToWindow,
        onChange: onSetFitToWindow,
        disabled: !isImage,
      },
    ],
  };

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.preview.menu.previewHelp")}
      aboutItemLabel={t("apps.preview.menu.aboutPreview")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={[fileMenu, viewMenu]} />
    </AppMenuBarShell>
  );
}
