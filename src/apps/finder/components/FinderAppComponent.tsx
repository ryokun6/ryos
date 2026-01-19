import { WindowFrame } from "@/components/layout/WindowFrame";
import { FinderMenuBar } from "./FinderMenuBar";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { FileList } from "./FileList";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { appMetadata } from "../index";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { RightClickMenu } from "@/components/ui/right-click-menu";
import {
  useFinderLogic,
  type FinderInitialData,
} from "../hooks/useFinderLogic";

export function FinderAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  initialData,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<FinderInitialData>) {
  const {
    // Translations
    t,
    // Dialog state
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isEmptyTrashDialogOpen,
    setIsEmptyTrashDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    renameValue,
    setRenameValue,
    isNewFolderDialogOpen,
    setIsNewFolderDialogOpen,
    newFolderName,
    setNewFolderName,
    // UI state
    isDraggingOver,
    storageSpace,
    contextMenuPos,
    setContextMenuPos,
    contextMenuFile,
    // Refs
    pathInputRef,
    fileInputRef,
    // File system state
    currentPath,
    selectedFile,
    isLoading,
    error,
    sortedFiles,
    // View and sort
    viewType,
    setViewType,
    sortType,
    setSortType,
    // Navigation
    navigateUp,
    navigateToPath,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    // File operations
    handleFileOpen,
    handleFileSelect,
    moveToTrash,
    trashItemsCount,
    // Handlers
    handleEmptyTrash,
    confirmEmptyTrash,
    handleNewWindow,
    handleFileDrop,
    handleFileMoved,
    handleDropToCurrentDirectory,
    handleImportFile,
    handleFileInputChange,
    handleRename,
    handleRenameSubmit,
    handleDuplicate,
    handleRestore,
    handleNewFolder,
    handleNewFolderSubmit,
    handleRenameRequest,
    handleItemContextMenu,
    handleBlankContextMenu,
    // Context menu
    blankMenuItems,
    fileMenuItems,
    blankLongPressHandlers,
    // Computed values
    canCreateFolder,
    rootFolders,
    windowTitle,
    isXpTheme,
    currentTheme,
    // Drag handlers
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleMouseLeave,
    handleParentButtonDrop,
    handleParentButtonDragOver,
    handleParentButtonDragLeave,
    // Path input handlers
    handlePathInputChange,
    handlePathInputKeyDown,
    // Help items
    translatedHelpItems,
    // Helper functions
    getFileType,
    getDisplayPath,
  } = useFinderLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  const menuBar = (
    <FinderMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      viewType={viewType}
      onViewTypeChange={setViewType}
      sortType={sortType}
      onSortTypeChange={setSortType}
      selectedFile={selectedFile}
      onMoveToTrash={moveToTrash}
      onEmptyTrash={handleEmptyTrash}
      onRestore={handleRestore}
      isTrashEmpty={trashItemsCount === 0}
      isInTrash={Boolean(selectedFile?.path.startsWith("/Trash"))}
      onNavigateBack={navigateBack}
      onNavigateForward={navigateForward}
      canNavigateBack={canNavigateBack()}
      canNavigateForward={canNavigateForward()}
      onNavigateToPath={navigateToPath}
      onImportFile={handleImportFile}
      onRename={handleRename}
      onDuplicate={handleDuplicate}
      onNewFolder={handleNewFolder}
      canCreateFolder={canCreateFolder}
      rootFolders={rootFolders}
      onNewWindow={handleNewWindow}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept={
          currentPath === "/Applets"
            ? ".app,.gz,.html,.htm"
            : ".app,.gz,.txt,.md,text/*"
        }
        onChange={handleFileInputChange}
      />
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="finder"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          className={`flex flex-col h-full w-full relative ${
            isDraggingOver && currentPath === "/Documents"
              ? "after:absolute after:inset-0 after:bg-black/20"
              : ""
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnd={handleDragEnd}
          onMouseLeave={handleMouseLeave}
          onDrop={handleFileDrop}
          onContextMenu={handleBlankContextMenu}
          {...blankLongPressHandlers}
        >
          <div
            className={`flex flex-col gap-1 p-1 ${
              isXpTheme
                ? "border-b border-[#919b9c]"
                : currentTheme === "macosx"
                ? "bg-transparent"
                : currentTheme === "system7"
                ? "bg-gray-100 border-b border-black"
                : "bg-gray-100 border-b border-gray-300"
            }`}
            style={{
              background: isXpTheme ? "transparent" : undefined,
              borderBottom:
                currentTheme === "macosx"
                  ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
                  : undefined,
            }}
          >
            <div className="flex gap-2 items-center">
              <div className="flex gap-0 items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateBack}
                  disabled={!canNavigateBack()}
                  className="h-8 w-8"
                >
                  <ArrowLeft size={14} weight="bold" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateForward}
                  disabled={!canNavigateForward()}
                  className="h-8 w-8"
                >
                  <ArrowRight size={14} weight="bold" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={navigateUp}
                  disabled={currentPath === "/"}
                  className="h-8 w-8"
                  onDragOver={handleParentButtonDragOver}
                  onDragLeave={handleParentButtonDragLeave}
                  onDrop={handleParentButtonDrop}
                >
                  <ArrowLeft size={14} className="rotate-90" weight="bold" />
                </Button>
              </div>
              <Input
                ref={pathInputRef}
                value={getDisplayPath(currentPath)}
                onChange={handlePathInputChange}
                onKeyDown={handlePathInputKeyDown}
                className={`flex-1 pl-2 ${
                  isXpTheme
                    ? "!text-[11px]"
                    : currentTheme === "macosx"
                    ? "!text-[12px] h-[26px]"
                    : "!text-[16px]"
                } `}
                style={
                  currentTheme === "macosx"
                    ? {
                        paddingTop: "2px",
                        paddingBottom: "2px",
                      }
                    : undefined
                }
                placeholder={t("apps.finder.placeholders.enterPath")}
              />
            </div>
          </div>
          <div
            className={`flex-1 bg-white ${
              viewType === "list"
                ? "overflow-auto"
                : "overflow-y-auto overflow-x-hidden"
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                {t("apps.finder.messages.loading")}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-500">
                {error}
              </div>
            ) : (
              <FileList
                files={sortedFiles}
                onFileOpen={handleFileOpen}
                onFileSelect={handleFileSelect}
                selectedFile={selectedFile}
                viewType={viewType}
                getFileType={getFileType}
                onFileDrop={handleFileMoved}
                onDropToCurrentDirectory={handleDropToCurrentDirectory}
                canDropFiles={canCreateFolder}
                currentPath={currentPath}
                onRenameRequest={handleRenameRequest}
                onItemContextMenu={handleItemContextMenu}
              />
            )}
          </div>
          <div className="os-status-bar os-status-bar-text flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12 bg-gray-100 border-t border-gray-300">
            <span>
              {sortedFiles.length}{" "}
              {sortedFiles.length !== 1
                ? t("apps.finder.statusBar.items")
                : t("apps.finder.statusBar.item")}
            </span>
            <span>
              {Math.round((storageSpace.available / 1024 / 1024) * 10) / 10} MB{" "}
              {t("apps.finder.statusBar.available")}
            </span>
          </div>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="finder"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="finder"
      />
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={confirmEmptyTrash}
        title={t("apps.finder.dialogs.emptyTrash.title")}
        description={t("apps.finder.dialogs.emptyTrash.description")}
      />
      <InputDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onSubmit={handleRenameSubmit}
        title={t("apps.finder.dialogs.renameItem.title")}
        description={t("apps.finder.dialogs.renameItem.description", {
          name: selectedFile?.name || "item",
        })}
        value={renameValue}
        onChange={setRenameValue}
      />
      <InputDialog
        isOpen={isNewFolderDialogOpen}
        onOpenChange={setIsNewFolderDialogOpen}
        onSubmit={handleNewFolderSubmit}
        title={t("apps.finder.dialogs.newFolder.title")}
        description={t("apps.finder.dialogs.newFolder.description")}
        value={newFolderName}
        onChange={setNewFolderName}
      />
      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={contextMenuFile ? fileMenuItems(contextMenuFile) : blankMenuItems}
      />
    </>
  );
}
