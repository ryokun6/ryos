import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
  type MenuItemDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useTranslation } from "react-i18next";
import type { ScaleOption } from "../hooks/useInfiniteMacLogic";

interface InfiniteMacMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onBackToPresets: () => void;
  onPause: () => void;
  onUnpause: () => void;
  onSetScale: (scale: ScaleOption) => void;
  onCaptureScreenshot: () => void;
  hasEmulator: boolean;
  isPaused: boolean;
  currentScale: ScaleOption;
}

const SCALE_OPTIONS: { scale: ScaleOption; label: string }[] = [
  { scale: 1, label: "1x" },
  { scale: 1.5, label: "1.5x" },
  { scale: 2, label: "2x" },
];

export function InfiniteMacMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onBackToPresets,
  onPause,
  onUnpause,
  onSetScale,
  onCaptureScreenshot,
  hasEmulator,
  isPaused,
  currentScale,
}: InfiniteMacMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isXpTheme,
    isMacOsxTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("infinite-mac");

  const backToPresetsItems: MenuItemDescriptor[] = hasEmulator
    ? [
        {
          type: "action",
          label: t("apps.infinite-mac.menu.backToPresets"),
          onClick: onBackToPresets,
        },
        { type: "separator" },
      ]
    : [];

  const menus: MenuDescriptor[] = [
    {
      label: t("common.menu.file"),
      items: [
        ...backToPresetsItems,
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    },
    {
      label: t("common.menu.view"),
      items: [
        {
          type: "submenu",
          label: t("apps.infinite-mac.menu.scaling"),
          items: SCALE_OPTIONS.map(({ scale, label }) => ({
            type: "checkbox" as const,
            label,
            checked: currentScale === scale,
            onChange: () => onSetScale(scale),
          })),
        },
        { type: "separator" },
        {
          type: "action",
          label: isPaused
            ? t("apps.infinite-mac.menu.resume")
            : t("apps.infinite-mac.menu.pause"),
          onClick: isPaused ? onUnpause : onPause,
          disabled: !hasEmulator,
        },
        {
          type: "action",
          label: t("apps.infinite-mac.menu.captureScreenshot"),
          onClick: onCaptureScreenshot,
          disabled: !hasEmulator,
        },
      ],
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
      helpItemLabel={t("apps.infinite-mac.menu.infiniteMacHelp")}
      aboutItemLabel={t("apps.infinite-mac.menu.aboutInfiniteMac")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
