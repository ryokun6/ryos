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
import { FileItem } from "./FileList";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useWindowFrameClose } from "@/components/layout/WindowFrame";

export type ViewType = "small" | "large" | "list";
export type SortType = "name" | "date" | "size" | "kind";

export interface FinderMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  viewType: ViewType;
  onViewTypeChange: (viewType: ViewType) => void;
  sortType: SortType;
  onSortTypeChange: (sortType: SortType) => void;
  selectedFile?: FileItem;
  onMoveToTrash: (file: FileItem) => void;
  onEmptyTrash: () => void;
  onRestore: () => void;
  isTrashEmpty: boolean;
  isInTrash: boolean;
  onNavigateBack?: () => void;
  onNavigateForward?: () => void;
  canNavigateBack?: boolean;
  canNavigateForward?: boolean;
  onNavigateToPath?: (path: string) => void;
  onImportFile?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onNewFolder?: () => void;
  canCreateFolder?: boolean;
  rootFolders?: FileItem[];
  onNewWindow?: () => void;
}

export function FinderMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  viewType,
  onViewTypeChange,
  sortType,
  onSortTypeChange,
  selectedFile,
  onMoveToTrash,
  onEmptyTrash,
  onRestore,
  isTrashEmpty,
  isInTrash,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack = false,
  canNavigateForward = false,
  onNavigateToPath,
  onImportFile,
  onRename,
  onDuplicate,
  onNewFolder,
  canCreateFolder = false,
  rootFolders,
  onNewWindow,
}: FinderMenuBarProps) {
  // Use wrapped close from WindowFrame if available (for animated close), otherwise fall back to prop
  const wrappedOnClose = useWindowFrameClose() || onClose;
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "finder";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const canMoveToTrash =
    selectedFile &&
    selectedFile.path !== "/Trash" &&
    !selectedFile.path.startsWith("/Trash/") &&
    // Prevent root folders from being moved to trash
    selectedFile.path !== "/Applications" &&
    selectedFile.path !== "/Documents" &&
    // Prevent applications from being moved to trash
    !selectedFile.path.startsWith("/Applications/");

  const canRename = selectedFile && onRename && canMoveToTrash;
  const canDuplicate = selectedFile && onDuplicate && !selectedFile.isDirectory;

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
            onClick={onNewWindow}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New Finder Window
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onNewFolder}
            disabled={!canCreateFolder}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            New Folder...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onImportFile}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Import from Device...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onRename}
            disabled={!canRename}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Rename...
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDuplicate}
            disabled={!canDuplicate}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          {isInTrash ? (
            <DropdownMenuItem
              onClick={onRestore}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Put Back
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => canMoveToTrash && onMoveToTrash(selectedFile!)}
              disabled={!canMoveToTrash}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Move to Trash
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={onEmptyTrash}
            disabled={isTrashEmpty}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Empty Trash...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={wrappedOnClose}
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
            Undo
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Cut
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Paste
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Clear
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
            onClick={() => onViewTypeChange("small")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(viewType !== "small" && "pl-4")}> 
              {viewType === "small" ? "✓ by Small Icon" : "by Small Icon"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onViewTypeChange("large")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(viewType !== "large" && "pl-4")}> 
              {viewType === "large" ? "✓ by Icon" : "by Icon"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onViewTypeChange("list")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(viewType !== "list" && "pl-4")}> 
              {viewType === "list" ? "✓ by List" : "by List"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => onSortTypeChange("name")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(sortType !== "name" && "pl-4")}>
              {sortType === "name" ? "✓ by Name" : "by Name"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortTypeChange("date")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(sortType !== "date" && "pl-4")}>
              {sortType === "date" ? "✓ by Date" : "by Date"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortTypeChange("size")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(sortType !== "size" && "pl-4")}>
              {sortType === "size" ? "✓ by Size" : "by Size"}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortTypeChange("kind")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            <span className={cn(sortType !== "kind" && "pl-4")}>
              {sortType === "kind" ? "✓ by Kind" : "by Kind"}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Go Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          >
            Go
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onNavigateForward}
            disabled={!canNavigateForward}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Forward
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />

          {/* Root directory folders */}
          {rootFolders?.map((folder) => (
            <DropdownMenuItem
              key={folder.path}
              onClick={() => onNavigateToPath?.(folder.path)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
            >
              <ThemedIcon
                name={folder.icon || "/icons/directory.png"}
                alt=""
                className="w-4 h-4 [image-rendering:pixelated]"
              />
              {folder.name}
            </DropdownMenuItem>
          ))}

          {/* Always show Trash at the end */}
          <DropdownMenuItem
            onClick={() => onNavigateToPath?.("/Trash")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name={
                isTrashEmpty
                  ? "/icons/trash-empty.png"
                  : "/icons/trash-full.png"
              }
              alt=""
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Trash
          </DropdownMenuItem>
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
            Finder Help
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
            About Finder
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
