import { Button } from "@/components/ui/button";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { FileItem } from "./FileList";
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";

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
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  canCut?: boolean;
  canCopy?: boolean;
  canPaste?: boolean;
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
  onCut,
  onCopy,
  onPaste,
  canCut = false,
  canCopy = false,
  canPaste = false,
}: FinderMenuBarProps) {
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
    <MenuBar>
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
            Undo
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={onCut}
            disabled={!canCut}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cut
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onCopy}
            disabled={!canCopy}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onPaste}
            disabled={!canPaste}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
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
          <DropdownMenuCheckboxItem
            checked={viewType === "small"}
            onCheckedChange={() => onViewTypeChange("small")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by Small Icon</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={viewType === "large"}
            onCheckedChange={() => onViewTypeChange("large")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by Icon</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={viewType === "list"}
            onCheckedChange={() => onViewTypeChange("list")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by List</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuCheckboxItem
            checked={sortType === "name"}
            onCheckedChange={() => onSortTypeChange("name")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by Name</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={sortType === "date"}
            onCheckedChange={() => onSortTypeChange("date")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by Date</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={sortType === "size"}
            onCheckedChange={() => onSortTypeChange("size")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by Size</span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={sortType === "kind"}
            onCheckedChange={() => onSortTypeChange("kind")}
            className="text-md h-6 px-3 pl-8 active:bg-gray-900 active:text-white flex justify-between items-center"
          >
            <span>by Kind</span>
          </DropdownMenuCheckboxItem>
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
              <img
                src={folder.icon || "/icons/folder.png"}
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
            <img
              src={
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
            onSelect={async () => {
              const appId = "finder"; // Specific app ID
              const shareUrl = generateAppShareUrl(appId);
              if (!shareUrl) return;
              try {
                await navigator.clipboard.writeText(shareUrl);
                toast.success("App link copied!", {
                  description: `Link to ${appId} copied to clipboard.`,
                });
              } catch (err) {
                console.error("Failed to copy app link: ", err);
                toast.error("Failed to copy link", {
                  description: "Could not copy link to clipboard.",
                });
              }
            }}
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
    </MenuBar>
  );
}
