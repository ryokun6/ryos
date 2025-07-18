import { useSound, Sounds } from "@/hooks/useSound";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export interface ResEditMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewFile: () => void;
  onImportFile: () => void;
  onSave: () => void;
  hasUnsavedChanges: boolean;
  currentFilePath: string | null;
  onAddResource: () => void;
}

export function ResEditMenuBar({
  onClose,
  onShowHelp,
  onNewFile,
  onImportFile,
  onSave,
  hasUnsavedChanges,
  currentFilePath,
  onAddResource,
}: ResEditMenuBarProps) {
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);

  const handleMenuClick = (callback: () => void) => {
    playButtonClick();
    callback();
  };

  return (
    <MenuBar>
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
            onClick={() => handleMenuClick(onNewFile)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(onImportFile)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Open...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleMenuClick(onSave)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled={!hasUnsavedChanges && !currentFilePath}
          >
            Save
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(onSave)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Save As...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleMenuClick(onClose)}
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
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Undo
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Redo
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Cut
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Paste
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Clear
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Select All
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
            Resource
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => handleMenuClick(onAddResource)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Add Resource
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Delete Resource
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            disabled
          >
            Get Resource Info
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Show Resource Types
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
            Window
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Minimize
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Zoom
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Bring All to Front
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
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => handleMenuClick(onShowHelp)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            ResEdit Help
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleMenuClick(() => {})}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About Resource Types
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </MenuBar>
  );
} 