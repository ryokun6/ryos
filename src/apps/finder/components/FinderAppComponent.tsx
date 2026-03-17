import { type CSSProperties, useRef } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { FinderMenuBar } from "./FinderMenuBar";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { FileList } from "./FileList";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  CaretLeft,
  CaretRight,
  SquaresFour,
  List,
  GearSix,
  CaretDown,
} from "@phosphor-icons/react";
import { SearchInput } from "@/components/ui/search-input";
import { ToolbarButton, ToolbarButtonGroup } from "@/components/ui/toolbar-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { appMetadata } from "../index";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { RightClickMenu } from "@/components/ui/right-click-menu";
import {
  useFinderLogic,
  type FinderInitialData,
} from "../hooks/useFinderLogic";
import { useRegisterUndoRedo } from "@/hooks/useUndoRedo";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { AirDropView } from "./AirDropView";

const FinderPanel = AppSidebarPanel;

function SidebarItem({
  name,
  icon,
  isActive,
  onClick,
}: {
  name: string;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-1.5 pl-1.5 pr-2.5 py-[2px] text-left text-[12px]",
        isActive ? "" : "hover:bg-black/5 transition-colors"
      )}
      data-selected={isActive ? "true" : undefined}
    >
      <ThemedIcon name={icon} alt="" className="w-8 h-8 shrink-0 [image-rendering:auto]" />
      <span className="truncate">{name}</span>
    </button>
  );
}

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
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();

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
    selectedFiles,
    selectionAnchorPath,
    isLoading,
    error,
    sortedFiles,
    // Search
    searchQuery,
    setSearchQuery,
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
    // Undo/redo
    undoFileOp,
    redoFileOp,
    canUndoFileOp,
    canRedoFileOp,
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
    isMacOSXTheme,
    currentTheme,
    // Sidebar
    showSidebar,
    setShowSidebar,
    sidebarItems,
    activeSidebarPath,
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
    // AirDrop
    isAirDropView,
    navigateToAirDrop,
    navigateAwayFromAirDrop,
    handleAirDropSendFile,
  } = useFinderLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  useRegisterUndoRedo(instanceId!, {
    undo: undoFileOp,
    redo: redoFileOp,
    canUndo: canUndoFileOp,
    canRedo: canRedoFileOp,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const effectiveShowSidebar = showSidebar;

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
      instanceId={instanceId}
      showSidebar={showSidebar}
      onToggleSidebar={() => setShowSidebar((s) => !s)}
      onNavigateToAirDrop={navigateToAirDrop}
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
        material={isMacOSXTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          ref={containerRef}
          className={cn(
            "flex flex-col h-full w-full relative",
            isDraggingOver && currentPath === "/Documents"
              ? "after:absolute after:inset-0 after:bg-black/20"
              : "",
            isMacOSXTheme ? "bg-transparent" : ""
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDragEnd={handleDragEnd}
          onMouseLeave={handleMouseLeave}
          onDrop={handleFileDrop}
          onContextMenu={handleBlankContextMenu}
          {...blankLongPressHandlers}
        >
          {/* Toolbar */}
          {isMacOSXTheme ? (
            <div
              className="flex items-center justify-between py-1.5 gap-2 px-1"
              style={{ background: "transparent" }}
            >
              <div className="flex items-center gap-1.5">
                <ToolbarButtonGroup>
                  <ToolbarButton
                    icon
                    onClick={() => {
                      if (isAirDropView) {
                        navigateAwayFromAirDrop();
                      } else {
                        navigateBack();
                      }
                    }}
                    disabled={!isAirDropView && !canNavigateBack()}
                  >
                    <CaretLeft size={14} weight="fill" className="scale-x-150 scale-y-90" />
                  </ToolbarButton>
                  <ToolbarButton icon onClick={navigateForward} disabled={!canNavigateForward()}>
                    <CaretRight size={14} weight="fill" className="scale-x-150 scale-y-90" />
                  </ToolbarButton>
                </ToolbarButtonGroup>
                <ToolbarButtonGroup>
                  <ToolbarButton icon data-state={viewType === "large" ? "on" : "off"} onClick={() => setViewType("large")}>
                    <SquaresFour size={14} />
                  </ToolbarButton>
                  <ToolbarButton icon data-state={viewType === "list" ? "on" : "off"} onClick={() => setViewType("list")}>
                    <List size={14} />
                  </ToolbarButton>
                </ToolbarButtonGroup>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <ToolbarButtonGroup>
                      <ToolbarButton icon className="gap-0.5">
                        <GearSix size={14} weight="fill" style={{ transform: "rotate(30deg)" }} />
                        <CaretDown size={8} weight="bold" />
                      </ToolbarButton>
                    </ToolbarButtonGroup>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem className="text-md h-6 px-3" onClick={handleNewFolder} disabled={!canCreateFolder}>
                      {t("apps.finder.contextMenu.newFolder")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-md h-6 px-3" onClick={handleImportFile}>
                      {t("apps.finder.menu.import")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-md h-6 px-3" onClick={navigateUp} disabled={currentPath === "/"}>
                      {t("apps.finder.menu.goUp")}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-md h-6 px-3" onClick={handleNewWindow}>
                      {t("apps.finder.menu.newWindow")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex-1" />
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                width="150px"
              />
            </div>
          ) : (
            <div
              className={cn(
                "flex flex-col gap-1 p-1",
                isXpTheme
                  ? "border-b border-[#919b9c]"
                  : currentTheme === "system7"
                  ? "bg-gray-100 border-b border-black"
                  : "bg-gray-100 border-b border-gray-300"
              )}
              style={{
                background: isXpTheme ? "transparent" : undefined,
              }}
            >
              <div className="flex gap-2 items-center">
                <div className="flex gap-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (isAirDropView) {
                        navigateAwayFromAirDrop();
                      } else {
                        navigateBack();
                      }
                    }}
                    disabled={!isAirDropView && !canNavigateBack()}
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
                  className={cn(
                    "flex-1 pl-2",
                    isXpTheme ? "!text-[11px]" : "!text-[16px]"
                  )}
                  placeholder={t("apps.finder.placeholders.enterPath")}
                />
              </div>
            </div>
          )}

          {/* Content area */}
          {isMacOSXTheme ? (
            <>
              <div className="flex-1 overflow-hidden flex gap-[5px]">
                {effectiveShowSidebar && (
                  <FinderPanel bordered className="w-[175px] shrink-0 flex flex-col min-h-0">
                    <div className="flex-1 overflow-y-auto font-geneva-12 py-1">
                      {sidebarItems.map((item) => (
                        <div key={item.path}>
                          <SidebarItem
                            name={item.name}
                            icon={item.icon}
                            isActive={activeSidebarPath === item.path}
                            onClick={() => {
                              if (item.isAirDrop) {
                                navigateToAirDrop();
                              } else {
                                navigateAwayFromAirDrop();
                                navigateToPath(item.path);
                              }
                            }}
                          />
                          {item.divider && (
                            <div className="mx-1.5 my-1.5 border-t border-black/15" />
                          )}
                        </div>
                      ))}
                    </div>
                  </FinderPanel>
                )}
                <FinderPanel bordered className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
                  {isAirDropView ? (
                    <div className="flex-1 bg-gradient-to-b from-[#e8ecf0] to-[#d1d5db]">
                      <AirDropView
                        onSendFile={handleAirDropSendFile}
                        onRequestLogin={promptVerifyToken}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "flex-1 bg-white/90",
                        viewType === "list"
                          ? "overflow-auto"
                          : "overflow-y-auto overflow-x-hidden"
                      )}
                      style={{ "--os-color-selection-bg": "#3875d7" } as CSSProperties}
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
                          selectedFiles={selectedFiles}
                          selectionAnchorPath={selectionAnchorPath}
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
                  )}
                </FinderPanel>
              </div>
              <div
                className="os-status-bar os-status-bar-text flex items-center justify-center px-2 pt-1 pb-0 text-[10px] font-geneva-12 bg-transparent border-t border-black/10"
                style={{
                  textShadow: "0 1px 0 rgba(255,255,255,0.5)",
                  color: "#333",
                }}
              >
                {sortedFiles.length}{" "}
                {sortedFiles.length !== 1
                  ? t("apps.finder.statusBar.items")
                  : t("apps.finder.statusBar.item")}
                ,{" "}
                {Math.round((storageSpace.available / 1024 / 1024) * 10) / 10} MB{" "}
                {t("apps.finder.statusBar.available")}
              </div>
            </>
          ) : (
            <>
              {isAirDropView ? (
                <div className="flex-1 bg-gradient-to-b from-gray-100 to-gray-200">
                  <AirDropView
                    onSendFile={handleAirDropSendFile}
                    onRequestLogin={promptVerifyToken}
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    "flex-1 bg-white",
                    viewType === "list"
                      ? "overflow-auto"
                      : "overflow-y-auto overflow-x-hidden"
                  )}
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
                      selectedFiles={selectedFiles}
                      selectionAnchorPath={selectionAnchorPath}
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
              )}
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
            </>
          )}
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
      <LoginDialog
        initialTab="signup"
        isOpen={isUsernameDialogOpen}
        onOpenChange={setIsUsernameDialogOpen}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={submitUsernameDialog}
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
      />
      <LoginDialog
        isOpen={isVerifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={async () => {
          setVerifyDialogOpen(false);
          promptSetUsername();
        }}
        isSignUpLoading={false}
        signUpError={null}
      />
      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={contextMenuFile ? fileMenuItems(contextMenuFile) : blankMenuItems}
      />
    </>
  );
}
