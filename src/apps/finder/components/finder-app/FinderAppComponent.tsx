import { useRef } from "react";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { FinderMenuBar } from "../FinderMenuBar";
import { AppProps } from "@/apps/base/types";
import {
  useFinderLogic,
  type FinderInitialData,
} from "../../hooks/useFinderLogic";
import { useRegisterUndoRedo } from "@/hooks/useUndoRedo";
import { useMenuShortcuts } from "@/hooks/useMenuShortcuts";
import { useAuth } from "@/hooks/useAuth";
import { FinderHiddenFileInput } from "./FinderHiddenFileInput";
import { FinderWindowBody } from "./FinderWindowBody";
import { FinderAppDialogs } from "./FinderAppDialogs";
import type { FinderFileListContentProps } from "./FinderFileListContent";

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
  const auth = useAuth();
  const logic = useFinderLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  const {
    t,
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
    isDraggingOver,
    storageSpace,
    contextMenuPos,
    setContextMenuPos,
    contextMenuFile,
    pathInputRef,
    fileInputRef,
    currentPath,
    selectedFile,
    selectedFiles,
    selectionAnchorPath,
    isLoading,
    error,
    sortedFiles,
    searchQuery,
    setSearchQuery,
    viewType,
    setViewType,
    navigateUp,
    navigateToPath,
    navigateBack,
    navigateForward,
    canNavigateBack,
    canNavigateForward,
    handleFileOpen,
    handleFileSelect,
    moveToTrash,
    trashItemsCount,
    undoFileOp,
    redoFileOp,
    canUndoFileOp,
    canRedoFileOp,
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
    blankMenuItems,
    fileMenuItems,
    blankLongPressHandlers,
    canCreateFolder,
    rootFolders,
    windowTitle,
    isWindowsTheme,
    isMacOSXTheme,
    currentTheme,
    showSidebar,
    setShowSidebar,
    sidebarItems,
    activeSidebarPath,
    handleDragOver,
    handleDragLeave,
    handleDragEnd,
    handleMouseLeave,
    handleParentButtonDrop,
    handleParentButtonDragOver,
    handleParentButtonDragLeave,
    handlePathInputChange,
    handlePathInputKeyDown,
    translatedHelpItems,
    getFileType,
    getDisplayPath,
    isAirDropView,
    navigateToAirDrop,
    navigateAwayFromAirDrop,
    handleAirDropSendFile,
  } = logic;

  useRegisterUndoRedo(instanceId!, {
    undo: undoFileOp,
    redo: redoFileOp,
    canUndo: canUndoFileOp,
    canRedo: canRedoFileOp,
  });

  // ⌘N New Window / ⇧⌘N New Folder fire in the Electron shell (browser reserves
  // these on the web, where the menu hints are hidden). New Folder is gated to
  // match the disabled menu item.
  useMenuShortcuts(instanceId, {
    newWindow: handleNewWindow,
    newFolder: () => {
      if (canCreateFolder) handleNewFolder();
    },
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const menuBar = (
    <FinderMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      viewType={viewType}
      onViewTypeChange={setViewType}
      sortType={logic.sortType}
      onSortTypeChange={logic.setSortType}
      selectedFile={selectedFile}
      onMoveToTrash={moveToTrash}
      onEmptyTrash={handleEmptyTrash}
      onRestore={handleRestore}
      isTrashEmpty={trashItemsCount === 0}
      isInTrash={Boolean(
        selectedFile && (currentPath === "/Trash" || selectedFile.status === "trashed")
      )}
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
      instanceId={instanceId}
      showSidebar={showSidebar}
      onToggleSidebar={() => setShowSidebar((s) => !s)}
      onNavigateToAirDrop={navigateToAirDrop}
    />
  );

  const fileListContentProps: FinderFileListContentProps = {
    t,
    isLoading,
    error,
    sortedFiles,
    fileListProps: {
      viewType,
      selectedFile,
      selectedFiles,
      selectionAnchorPath,
      currentPath,
      canDropFiles: canCreateFolder,
      onFileOpen: handleFileOpen,
      onFileSelect: handleFileSelect,
      getFileType,
      onFileDrop: handleFileMoved,
      onDropToCurrentDirectory: handleDropToCurrentDirectory,
      onRenameRequest: handleRenameRequest,
      onItemContextMenu: handleItemContextMenu,
    },
  };

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      leading={
        <FinderHiddenFileInput
          fileInputRef={fileInputRef}
          currentPath={currentPath}
          onChange={handleFileInputChange}
        />
      }
      windowFrameProps={{
        title: windowTitle,
        onClose,
        isForeground,
        appId: "finder",
        material: isMacOSXTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
      trailing={
        <FinderAppDialogs
          t={t}
          translatedHelpItems={translatedHelpItems}
          isHelpDialogOpen={isHelpDialogOpen}
          setIsHelpDialogOpen={setIsHelpDialogOpen}
          isAboutDialogOpen={isAboutDialogOpen}
          setIsAboutDialogOpen={setIsAboutDialogOpen}
          isEmptyTrashDialogOpen={isEmptyTrashDialogOpen}
          setIsEmptyTrashDialogOpen={setIsEmptyTrashDialogOpen}
          confirmEmptyTrash={confirmEmptyTrash}
          isRenameDialogOpen={isRenameDialogOpen}
          setIsRenameDialogOpen={setIsRenameDialogOpen}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          handleRenameSubmit={handleRenameSubmit}
          selectedFile={selectedFile}
          isNewFolderDialogOpen={isNewFolderDialogOpen}
          setIsNewFolderDialogOpen={setIsNewFolderDialogOpen}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          handleNewFolderSubmit={handleNewFolderSubmit}
          isUsernameDialogOpen={auth.isUsernameDialogOpen}
          setIsUsernameDialogOpen={auth.setIsUsernameDialogOpen}
          newUsername={auth.newUsername}
          setNewUsername={auth.setNewUsername}
          newPassword={auth.newPassword}
          setNewPassword={auth.setNewPassword}
          submitUsernameDialog={auth.submitUsernameDialog}
          isSettingUsername={auth.isSettingUsername}
          usernameError={auth.usernameError}
          isVerifyDialogOpen={auth.isVerifyDialogOpen}
          setVerifyDialogOpen={auth.setVerifyDialogOpen}
          verifyPasswordInput={auth.verifyPasswordInput}
          setVerifyPasswordInput={auth.setVerifyPasswordInput}
          verifyUsernameInput={auth.verifyUsernameInput}
          setVerifyUsernameInput={auth.setVerifyUsernameInput}
          isVerifyingToken={auth.isVerifyingToken}
          verifyError={auth.verifyError}
          handleVerifyTokenSubmit={auth.handleVerifyTokenSubmit}
          promptSetUsername={auth.promptSetUsername}
          contextMenuPos={contextMenuPos}
          setContextMenuPos={setContextMenuPos}
          contextMenuFile={contextMenuFile}
          fileMenuItems={fileMenuItems}
          blankMenuItems={blankMenuItems}
        />
      }
    >
      <FinderWindowBody
          containerRef={containerRef}
          isMacOSXTheme={isMacOSXTheme}
          isDraggingOver={isDraggingOver}
          currentPath={currentPath}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDragEnd={handleDragEnd}
          handleMouseLeave={handleMouseLeave}
          handleFileDrop={handleFileDrop}
          handleBlankContextMenu={handleBlankContextMenu}
          blankLongPressHandlers={blankLongPressHandlers}
          macToolbarProps={{
            t,
            isAirDropView,
            currentPath,
            searchQuery,
            setSearchQuery,
            viewType,
            setViewType,
            canNavigateBack,
            canNavigateForward,
            canCreateFolder,
            navigateBack,
            navigateForward,
            navigateAwayFromAirDrop,
            navigateUp,
            handleNewFolder,
            handleImportFile,
            handleNewWindow,
          }}
          legacyToolbarProps={{
            t,
            isWindowsTheme,
            currentTheme,
            isAirDropView,
            currentPath,
            pathInputRef,
            displayPath: getDisplayPath(currentPath),
            canNavigateBack,
            canNavigateForward,
            navigateBack,
            navigateForward,
            navigateAwayFromAirDrop,
            navigateUp,
            handlePathInputChange,
            handlePathInputKeyDown,
            handleParentButtonDragOver,
            handleParentButtonDragLeave,
            handleParentButtonDrop,
          }}
          macContentProps={{
            t,
            showSidebar,
            sidebarItems,
            activeSidebarPath,
            isAirDropView,
            sortedFilesCount: sortedFiles.length,
            storageSpaceAvailable: storageSpace.available,
            fileListContentProps,
            navigateToAirDrop,
            navigateAwayFromAirDrop,
            navigateToPath,
            handleAirDropSendFile,
            promptVerifyToken: auth.promptVerifyToken,
          }}
          legacyContentProps={{
            t,
            isAirDropView,
            sortedFilesCount: sortedFiles.length,
            storageSpaceAvailable: storageSpace.available,
            fileListContentProps,
            handleAirDropSendFile,
            promptVerifyToken: auth.promptVerifyToken,
          }}
        />
    </AppWindowShell>
  );
}
