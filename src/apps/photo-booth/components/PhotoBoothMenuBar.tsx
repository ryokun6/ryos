import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";

interface Effect {
  name: string;
  filter: string;
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "photo-booth";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((s) => s.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onExportPhotos}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Export Photos
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClearPhotos}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Clear All Photos
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onClose}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            Camera
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          {availableCameras.map((camera) => (
            <DropdownMenuItem
              key={camera.deviceId}
              onClick={() => onCameraSelect(camera.deviceId)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span
                className={cn(selectedCameraId !== camera.deviceId && "pl-4")}
              >
                {selectedCameraId === camera.deviceId ? "✓ " : ""}
                {camera.label || `Camera ${camera.deviceId.slice(0, 4)}`}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            Effects
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          {effects.map((effect) => (
            <DropdownMenuItem
              key={effect.name}
              onClick={() => onEffectSelect(effect)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span
                className={cn(selectedEffect.name !== effect.name && "pl-4")}
              >
                {selectedEffect.name === effect.name ? "✓ " : ""}
                {effect.name}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
          >
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Photo Booth Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Share App...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onShowAbout}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About Photo Booth
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
