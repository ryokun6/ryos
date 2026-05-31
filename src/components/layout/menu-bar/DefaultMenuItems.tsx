import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAppStoreShallow } from "@/stores/helpers";
import { useUndoRedoStore } from "@/stores/useUndoRedoStore";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { appMetadata as finderMetadata, helpItems as finderHelpItems } from "@/apps/finder/metadata";

export function DefaultMenuItems() {
  const { t } = useTranslation();
  const launchApp = useLaunchApp();
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const translatedHelpItems = useTranslatedHelpItems("finder", finderHelpItems);

  const foregroundId = useAppStoreShallow((s) => s.foregroundInstanceId);
  const undoRedoEntry = useUndoRedoStore(
    (s) => (foregroundId ? s.handlers[foregroundId] : null)
  );

  const handleLaunchFinder = (path: string) => {
    launchApp("finder", { initialPath: path });
  };

  return (
    <>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={() => handleLaunchFinder("/")}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.newFinderWindow")}
          </MenubarItem>
          <MenubarItem
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.newFolder")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            disabled
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.moveToTrash")}
          </MenubarItem>
          <MenubarItem
            disabled
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.emptyTrash")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            disabled
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
          <MenubarItem
            onClick={() => undoRedoEntry?.undo()}
            disabled={!undoRedoEntry?.canUndo}
            className={`text-md h-6 px-3 ${!undoRedoEntry?.canUndo ? "text-neutral-500" : ""}`}
          >
            {t("common.menu.undo")}
          </MenubarItem>
          <MenubarItem
            onClick={() => undoRedoEntry?.redo()}
            disabled={!undoRedoEntry?.canRedo}
            className={`text-md h-6 px-3 ${!undoRedoEntry?.canRedo ? "text-neutral-500" : ""}`}
          >
            {t("common.menu.redo")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            disabled
            className="text-md h-6 px-3"
          >
            {t("common.menu.cut")}
          </MenubarItem>
          <MenubarItem
            disabled
            className="text-md h-6 px-3"
          >
            {t("common.menu.copy")}
          </MenubarItem>
          <MenubarItem
            disabled
            className="text-md h-6 px-3"
          >
            {t("common.menu.paste")}
          </MenubarItem>
          <MenubarItem
            disabled
            className="text-md h-6 px-3"
          >
            {t("common.menu.clear")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            disabled
            className="text-md h-6 px-3"
          >
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
            checked={false}
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.bySmallIcon")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={true}
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byIcon")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={false}
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byList")}
          </MenubarCheckboxItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarCheckboxItem
            checked={true}
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byName")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={false}
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.byDate")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={false}
            disabled
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.bySize")}
          </MenubarCheckboxItem>
          <MenubarCheckboxItem
            checked={false}
            disabled
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
            disabled
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.back")}
          </MenubarItem>
          <MenubarItem
            disabled
            className="text-md h-6 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t("apps.finder.menu.forward")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => handleLaunchFinder("/Applications")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="applications.png"
              alt={t("common.menu.applications")}
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            {t("common.menu.applications")}
          </MenubarItem>
          <MenubarItem
            onClick={() => handleLaunchFinder("/Documents")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="documents.png"
              alt={t("common.menu.documents")}
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            {t("common.menu.documents")}
          </MenubarItem>
          <MenubarItem
            onClick={() => handleLaunchFinder("/Images")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="images.png"
              alt={t("common.menu.images")}
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            {t("common.menu.images")}
          </MenubarItem>
          <MenubarItem
            onClick={() => handleLaunchFinder("/Music")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="sounds.png"
              alt={t("common.menu.music")}
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            {t("common.menu.music")}
          </MenubarItem>
          <MenubarItem
            onClick={() => handleLaunchFinder("/Sites")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="sites.png"
              alt={t("common.menu.sites")}
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            {t("common.menu.sites")}
          </MenubarItem>
          <MenubarItem
            onClick={() => handleLaunchFinder("/Videos")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="movies.png"
              alt={t("common.menu.videos")}
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            {t("common.menu.videos")}
          </MenubarItem>
          <MenubarItem
            onClick={() => handleLaunchFinder("/Trash")}
            className="text-md h-6 px-3 flex items-center gap-2"
          >
            <ThemedIcon
              name="trash-empty.png"
              alt={t("common.menu.trash")}
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
            onClick={() => setIsHelpDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.finderHelp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => setIsAboutDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("apps.finder.menu.aboutFinder")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="finder"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={finderMetadata}
        appId="finder"
      />
    </>
  );
}
