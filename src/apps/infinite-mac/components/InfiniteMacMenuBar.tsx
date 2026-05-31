import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { AppMenuBarHelpMenu } from "@/components/shared/menubar/AppMenuBarHelpMenu";
import { AppShareItemDialog } from "@/components/shared/menubar/AppShareItemDialog";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
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

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {hasEmulator && (
            <>
              <MenubarItem onClick={onBackToPresets} className={MENUBAR_ITEM_CLASS}>
                {t("apps.infinite-mac.menu.backToPresets")}
              </MenubarItem>
              <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
            </>
          )}
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
          <MenubarSub>
            <MenubarSubTrigger className={MENUBAR_ITEM_CLASS}>
              {t("apps.infinite-mac.menu.scaling")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={currentScale === 1}
                onCheckedChange={() => onSetScale(1)}
                className={MENUBAR_ITEM_CLASS}
              >
                1x
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={currentScale === 1.5}
                onCheckedChange={() => onSetScale(1.5)}
                className={MENUBAR_ITEM_CLASS}
              >
                1.5x
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={currentScale === 2}
                onCheckedChange={() => onSetScale(2)}
                className={MENUBAR_ITEM_CLASS}
              >
                2x
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarItem
            onClick={isPaused ? onUnpause : onPause}
            className={MENUBAR_ITEM_CLASS}
            disabled={!hasEmulator}
          >
            {isPaused
              ? t("apps.infinite-mac.menu.resume")
              : t("apps.infinite-mac.menu.pause")}
          </MenubarItem>
          <MenubarItem
            onClick={onCaptureScreenshot}
            className={MENUBAR_ITEM_CLASS}
            disabled={!hasEmulator}
          >
            {t("apps.infinite-mac.menu.captureScreenshot")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <AppMenuBarHelpMenu
        helpItemLabel={t("apps.infinite-mac.menu.infiniteMacHelp")}
        aboutItemLabel={t("apps.infinite-mac.menu.aboutInfiniteMac")}
        isMacOsxTheme={isMacOsxTheme}
        onShowHelp={onShowHelp}
        onShowAbout={onShowAbout}
        onOpenShareDialog={() => setIsShareDialogOpen(true)}
      />
      <AppShareItemDialog
        appId={appId}
        appName={appName}
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
      />
    </MenuBar>
  );
}
