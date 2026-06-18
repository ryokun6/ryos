import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";

interface Effect {
  name: string;
  filter: string;
  translationKey: string;
}

interface PhotoBoothMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClearPhotos: () => void;
  onExportPhotos: () => void;
  effects: Effect[];
  selectedEffect: Effect;
  onEffectSelect: (effect: Effect) => void;
  availableCameras: MediaDeviceInfo[];
  selectedCameraId: string | null;
  onCameraSelect: (deviceId: string) => void;
}

export function PhotoBoothMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClearPhotos,
  onExportPhotos,
  effects,
  selectedEffect,
  onEffectSelect,
  availableCameras,
  selectedCameraId,
  onCameraSelect,
}: PhotoBoothMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("photo-booth");

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.photo-booth.menu.exportPhotos"),
          onClick: onExportPhotos,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("apps.photo-booth.menu.clearAllPhotos"),
          onClick: onClearPhotos,
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
    {
      label: t("apps.photo-booth.menu.camera"),
      items: availableCameras.map((camera) => ({
        type: "checkbox" as const,
        label:
          camera.label ||
          `${t("apps.photo-booth.menu.camera")} ${camera.deviceId.slice(
            0,
            4
          )}`,
        checked: selectedCameraId === camera.deviceId,
        onChange: (checked: boolean) => {
          if (checked) onCameraSelect(camera.deviceId);
        },
      })),
    },
    {
      label: t("apps.photo-booth.menu.effects"),
      items: effects.map((effect) => ({
        type: "checkbox" as const,
        label: t(`apps.photo-booth.effects.${effect.translationKey}`),
        checked: selectedEffect.name === effect.name,
        onChange: (checked: boolean) => {
          if (checked) onEffectSelect(effect);
        },
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
      helpItemLabel={t("apps.photo-booth.menu.photoBoothHelp")}
      aboutItemLabel={t("apps.photo-booth.menu.aboutPhotoBooth")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
