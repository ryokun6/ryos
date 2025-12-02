import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Game, loadGames } from "@/stores/usePcStore";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface PcMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onSaveState: () => void;
  onLoadState: () => void;
  onReset: () => void;
  onLoadGame: (game: Game) => void;
  selectedGame: Game;
  onSetMouseCapture: (capture: boolean) => void;
  onSetFullScreen: (fullScreen: boolean) => void;
  onSetRenderAspect: (aspect: string) => void;
  onSetMouseSensitivity: (sensitivity: number) => void;
  isMouseCaptured: boolean;
  isFullScreen: boolean;
  currentRenderAspect: string;
  mouseSensitivity: number;
}

export function PcMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onSaveState,
  onLoadState,
  onReset,
  onLoadGame,
  selectedGame,
  onSetMouseCapture,
  onSetFullScreen,
  onSetRenderAspect,
  onSetMouseSensitivity,
  isMouseCaptured,
  isFullScreen,
  currentRenderAspect,
  mouseSensitivity,
}: PcMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "pc";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const availableGames = loadGames();
  const renderAspects = ["AsIs", "1/1", "5/4", "4/3", "16/10", "16/9", "Fit"];
  const sensitivityOptions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            {t("common.menu.file")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.pc.menu.loadGame")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="px-0">
              {availableGames.map((game) => (
                <DropdownMenuItem
                  key={game.id}
                  onClick={() => onLoadGame(game)}
                  className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                    selectedGame.id === game.id ? "bg-gray-100" : ""
                  }`}
                >
                  {game.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onSaveState}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.saveState")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onLoadState}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.loadState")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onReset}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.reset")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.close")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.controls")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
        <DropdownMenuItem
            onClick={() => onSetFullScreen(!isFullScreen)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.fullScreen")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => onSetMouseCapture(!isMouseCaptured)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.toggleMouseCapture")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.pc.menu.mouseSensitivity")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="px-0">
              {sensitivityOptions.map((sensitivity) => (
                <DropdownMenuItem
                  key={sensitivity}
                  onClick={() => onSetMouseSensitivity(sensitivity)}
                  className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                    mouseSensitivity === sensitivity ? "bg-gray-100" : ""
                  }`}
                >
                  {sensitivity}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
              {t("apps.pc.menu.aspectRatio")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="px-0">
              {renderAspects.map((aspect) => (
                <DropdownMenuItem
                  key={aspect}
                  onClick={() => onSetRenderAspect(aspect)}
                  className={`text-md h-6 px-3 active:bg-gray-900 active:text-white ${
                    currentRenderAspect === aspect ? "bg-gray-100" : ""
                  }`}
                >
                  {aspect}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.help")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.virtualPcHelp")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("common.menu.shareApp")}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            {t("apps.pc.menu.aboutVirtualPc")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
