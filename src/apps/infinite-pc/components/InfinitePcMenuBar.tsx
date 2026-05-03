import { useState } from "react";
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
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { Game, loadGames } from "@/stores/usePcStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { getTranslatedAppName } from "@/utils/i18n";

interface InfinitePcMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onBackToBrowse: () => void;
  onFullScreen: () => void;
  onCaptureScreenshot: () => void;
  hasV86Session: boolean;
  isGameRunning: boolean;
  onSaveState?: () => void;
  onLoadState?: () => void;
  onReset?: () => void;
  onLoadGame?: (game: Game) => void;
  selectedGame?: Game;
  onSetMouseCapture?: (capture: boolean) => void;
  onSetDosFullScreen?: (fullScreen: boolean) => void;
  onSetRenderAspect?: (aspect: string) => void;
  onSetMouseSensitivity?: (sensitivity: number) => void;
  isMouseCaptured?: boolean;
  isDosFullScreen?: boolean;
  currentRenderAspect?: string;
  mouseSensitivity?: number;
}

export function InfinitePcMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onBackToBrowse,
  onFullScreen,
  onCaptureScreenshot,
  hasV86Session,
  isGameRunning,
  onSaveState,
  onLoadState,
  onReset,
  onLoadGame,
  selectedGame,
  onSetMouseCapture,
  onSetDosFullScreen,
  onSetRenderAspect,
  onSetMouseSensitivity,
  isMouseCaptured = false,
  isDosFullScreen = false,
  currentRenderAspect = "4/3",
  mouseSensitivity = 1,
}: InfinitePcMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";
  const availableGames = loadGames();
  const renderAspects = ["AsIs", "1/1", "5/4", "4/3", "16/10", "16/9", "Fit"];
  const sensitivityOptions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const appName = getTranslatedAppName("pc");

  if (isGameRunning && selectedGame && onLoadGame && onReset) {
    return (
      <MenuBar inWindowFrame={isXpTheme}>
        <MenubarMenu>
          <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
            {t("common.menu.file")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            <MenubarItem
              onClick={onBackToBrowse}
              className="text-md h-6 px-3"
            >
              {t("apps.pc.menu.backToBrowse")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarSub>
              <MenubarSubTrigger className="text-md h-6 px-3">
                {t("apps.pc.menu.loadGame")}
              </MenubarSubTrigger>
              <MenubarSubContent className="px-0">
                {availableGames.map((game) => (
                  <MenubarItem
                    key={game.id}
                    onClick={() => onLoadGame(game)}
                    className={`text-md h-6 px-3 ${
                      selectedGame.id === game.id ? "bg-gray-100" : ""
                    }`}
                  >
                    {game.name}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onSaveState} className="text-md h-6 px-3">
              {t("apps.pc.menu.saveState")}
            </MenubarItem>
            <MenubarItem onClick={onLoadState} className="text-md h-6 px-3">
              {t("apps.pc.menu.loadState")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onReset} className="text-md h-6 px-3">
              {t("apps.pc.menu.reset")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onClose} className="text-md h-6 px-3">
              {t("common.menu.close")}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
            {t("apps.pc.menu.controls")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            <MenubarItem
              onClick={() => onSetDosFullScreen?.(!isDosFullScreen)}
              className="text-md h-6 px-3"
            >
              {t("apps.pc.menu.fullScreen")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem
              onClick={() => onSetMouseCapture?.(!isMouseCaptured)}
              className="text-md h-6 px-3"
            >
              {t("apps.pc.menu.toggleMouseCapture")}
            </MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger className="text-md h-6 px-3">
                {t("apps.pc.menu.mouseSensitivity")}
              </MenubarSubTrigger>
              <MenubarSubContent className="px-0">
                {sensitivityOptions.map((sensitivity) => (
                  <MenubarItem
                    key={sensitivity}
                    onClick={() => onSetMouseSensitivity?.(sensitivity)}
                    className={`text-md h-6 px-3 ${
                      mouseSensitivity === sensitivity ? "bg-gray-100" : ""
                    }`}
                  >
                    {sensitivity}x
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarSub>
              <MenubarSubTrigger className="text-md h-6 px-3">
                {t("apps.pc.menu.aspectRatio")}
              </MenubarSubTrigger>
              <MenubarSubContent className="px-0">
                {renderAspects.map((aspect) => (
                  <MenubarItem
                    key={aspect}
                    onClick={() => onSetRenderAspect?.(aspect)}
                    className={`text-md h-6 px-3 ${
                      currentRenderAspect === aspect ? "bg-gray-100" : ""
                    }`}
                  >
                    {t(`apps.pc.aspectRatios.${aspect}`, { defaultValue: aspect })}
                  </MenubarItem>
                ))}
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
            {t("common.menu.help")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
              {t("apps.pc.menu.virtualPcHelp")}
            </MenubarItem>
            {!isMacOsxTheme && (
              <>
                <MenubarItem
                  onSelect={() => setIsShareDialogOpen(true)}
                  className="text-md h-6 px-3"
                >
                  {t("common.menu.shareApp")}
                </MenubarItem>
                <MenubarSeparator className="h-[2px] bg-black my-1" />
                <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                  {t("apps.pc.menu.aboutVirtualPc")}
                </MenubarItem>
              </>
            )}
          </MenubarContent>
        </MenubarMenu>
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType="App"
          itemIdentifier="pc"
          title={appName}
          generateShareUrl={generateAppShareUrl}
        />
      </MenuBar>
    );
  }

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {hasV86Session && (
            <>
              <MenubarItem
                onClick={onBackToBrowse}
                className="text-md h-6 px-3"
              >
                {t("apps.pc.menu.backToBrowse")}
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
          <MenubarItem
            onClick={onFullScreen}
            className="text-md h-6 px-3"
            disabled={!hasV86Session}
          >
            {t("apps.pc.menu.fullScreen")}
          </MenubarItem>
          <MenubarItem
            onClick={onCaptureScreenshot}
            className="text-md h-6 px-3"
            disabled={!hasV86Session}
          >
            {t("apps.pc.menu.captureScreenshot")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.pc.menu.virtualPcHelp")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.pc.menu.aboutVirtualPc")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier="pc"
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
