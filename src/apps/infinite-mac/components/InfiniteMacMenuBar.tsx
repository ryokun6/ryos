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
import { useAppMenuBar } from "@/hooks/useAppMenuBar";
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
  const { t, isXpTheme, isMacOsxTheme } = useAppMenuBar("infinite-mac");

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {hasEmulator && (
            <>
              <MenubarItem
                onClick={onBackToPresets}
                className="text-md h-6 px-3"
              >
                {t("apps.infinite-mac.menu.backToPresets")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
            </>
          )}
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSub>
            <MenubarSubTrigger className="text-md h-6 px-3">
              {t("apps.infinite-mac.menu.scaling")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0">
              <MenubarCheckboxItem
                checked={currentScale === 1}
                onCheckedChange={() => onSetScale(1)}
                className="text-md h-6 px-3"
              >
                1x
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={currentScale === 1.5}
                onCheckedChange={() => onSetScale(1.5)}
                className="text-md h-6 px-3"
              >
                1.5x
              </MenubarCheckboxItem>
              <MenubarCheckboxItem
                checked={currentScale === 2}
                onCheckedChange={() => onSetScale(2)}
                className="text-md h-6 px-3"
              >
                2x
              </MenubarCheckboxItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={isPaused ? onUnpause : onPause}
            className="text-md h-6 px-3"
            disabled={!hasEmulator}
          >
            {isPaused
              ? t("apps.infinite-mac.menu.resume")
              : t("apps.infinite-mac.menu.pause")}
          </MenubarItem>
          <MenubarItem
            onClick={onCaptureScreenshot}
            className="text-md h-6 px-3"
            disabled={!hasEmulator}
          >
            {t("apps.infinite-mac.menu.captureScreenshot")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.infinite-mac.menu.infiniteMacHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.infinite-mac.menu.aboutInfiniteMac")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
