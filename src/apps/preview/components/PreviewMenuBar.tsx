import { useTranslation } from "react-i18next";
import type { AppId } from "@/config/appRegistry";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { getTranslatedAppName } from "@/utils/i18n";
import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
} from "../hooks/useImageZoomGestures";

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
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
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
  onZoomIn,
  onZoomOut,
  onActualSize,
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
        onClick: onZoomIn,
        disabled: !isImage || (!fitToWindow && zoom >= PREVIEW_ZOOM_MAX),
        shortcut: "+",
      },
      {
        type: "action",
        label: t("apps.preview.menu.zoomOut"),
        onClick: onZoomOut,
        disabled: !isImage || (!fitToWindow && zoom <= PREVIEW_ZOOM_MIN),
        shortcut: "−",
      },
      {
        type: "action",
        label: t("apps.preview.menu.actualSize"),
        onClick: onActualSize,
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
