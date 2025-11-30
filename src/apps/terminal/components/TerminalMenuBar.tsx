import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";

export interface TerminalMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClear: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onResetFontSize: () => void;
  onToggleMute?: () => void;
  isMuted?: boolean;
}

export function TerminalMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClear,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onResetFontSize,
  onToggleMute,
  isMuted = false,
}: TerminalMenuBarProps) {
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "terminal";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
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
            onClick={onClear}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Clear Terminal
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

      {/* Edit Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Paste
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Select All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onIncreaseFontSize}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Increase Font Size
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDecreaseFontSize}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Decrease Font Size
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onResetFontSize}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Reset Font Size
          </DropdownMenuItem>
          {onToggleMute && (
            <>
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
              <DropdownMenuItem
                onClick={onToggleMute}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                <span className={cn(!isMuted && "pl-4")}>
                  {isMuted ? "✓ Mute Sounds" : "Mute Sounds"}
                </span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onShowHelp}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Terminal Help
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
            About Terminal
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
