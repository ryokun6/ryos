import { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { FileItem } from "./FileList";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "finder";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const isMacOsxTheme = currentTheme === "macosx";

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
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onNewWindow}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.newFinderWindow")}
          </MenubarItem>
          <MenubarItem
            onClick={onNewFolder}
            disabled={!canCreateFolder}
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.newFolder")}
          </MenubarItem>
          <MenubarItem
            onClick={onImportFile}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.importFromDevice")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onRename}
            disabled={!canRename}
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.rename")}
          </MenubarItem>
          <MenubarItem
            onClick={onDuplicate}
            disabled={!canDuplicate}
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.duplicate")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          {isInTrash ? (
            <MenubarItem
              onClick={onRestore}
              className="text-md h-6 px-3"
            >
              {t("apps.finder.menu.putBack")}
            </MenubarItem>
          ) : (
            <MenubarItem
              onClick={() => canMoveToTrash && onMoveToTrash(selectedFile!)}
              disabled={!canMoveToTrash}
              className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("apps.finder.menu.moveToTrash")}
            </MenubarItem>
          )}
          <MenubarItem
            onClick={onEmptyTrash}
            disabled={isTrashEmpty}
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.emptyTrash")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.undo")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.cut")}
          </MenubarItem>
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.copy")}
          </MenubarItem>
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.paste")}
          </MenubarItem>
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.clear")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem className="text-md h-6 px-3">
            {t("common.menu.selectAll")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.view")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarCheckboxItem
            checked={viewType === "small"}
            onCheckedChange={(checked) => {
              if (checked) onViewTypeChange("small");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.bySmallIcon")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={viewType === "large"}
            onCheckedChange={(checked) => {
              if (checked) onViewTypeChange("large");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byIcon")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={viewType === "list"}
            onCheckedChange={(checked) => {
              if (checked) onViewTypeChange("list");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byList")}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={sortType === "name"}
            onCheckedChange={(checked) => {
              if (checked) onSortTypeChange("name");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byName")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={sortType === "date"}
            onCheckedChange={(checked) => {
              if (checked) onSortTypeChange("date");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byDate")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={sortType === "size"}
            onCheckedChange={(checked) => {
              if (checked) onSortTypeChange("size");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.bySize")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={sortType === "kind"}
            onCheckedChange={(checked) => {
              if (checked) onSortTypeChange("kind");
            }}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byKind")}
          </MenubarCheckboxItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Go Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.go")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.back")}
          </MenubarItem>
          <MenubarItem
            onClick={onNavigateForward}
            disabled={!canNavigateForward}
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.forward")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />

          {/* Root directory folders */}
          {rootFolders?.map((folder) => (
            <MenubarItem
              key={folder.path}
              onClick={() => onNavigateToPath?.(folder.path)}
              className="text-md h-6 px-3 flex items-center gap-2"
            >
              <ThemedIcon
                name={folder.icon || "/icons/directory.png"}
                alt=""
                className="w-4 h-4 [image-rendering:pixelated]"
              />
              {folder.name}
            </MenubarItem>
          ))}

          {/* Always show Trash at the end */}
          <MenubarItem
            onClick={() => onNavigateToPath?.("/Trash")}
            className="text-md h-6 px-3 flex items-center gap-2"
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
            {t("common.menu.trash")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.finderHelp")}
          </MenubarItem>
          {/* Share and About only shown in non-macOS X themes (moved to App Menu in macOS X) */}
          {!isMacOsxTheme && (
            <>
              <MenubarItem
                onSelect={() => setIsShareDialogOpen(true)}
                className="text-md h-6 px-3"
              >
                {t("common.menu.shareApp")}
              </MenubarItem>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem
                onClick={onShowAbout}
                className="text-md h-6 px-3"
              >
                {t("apps.finder.menu.aboutFinder")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
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
