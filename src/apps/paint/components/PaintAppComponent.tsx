import React from "react";
import { PaintToolbar } from "./PaintToolbar";
import { PaintCanvas } from "./PaintCanvas";
import { PaintMenuBar } from "./PaintMenuBar";
import { PaintPatternPalette } from "./PaintPatternPalette";
import { PaintStrokeSettings } from "./PaintStrokeSettings";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps, PaintInitialData } from "../../base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { appMetadata } from "..";
import { usePaintLogic } from "../hooks/usePaintLogic";

export const PaintAppComponent: React.FC<AppProps<PaintInitialData>> = ({
  isWindowOpen,
  onClose,
  isForeground = false,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}) => {
  const {
    t,
    translatedHelpItems,
    selectedTool,
    handleToolSelect,
    selectedPattern,
    setSelectedPattern,
    strokeWidth,
    setStrokeWidth,
    canUndo,
    setCanUndo,
    canRedo,
    setCanRedo,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmNewDialogOpen,
    setIsConfirmNewDialogOpen,
    hasUnsavedChanges,
    currentFilePath,
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveFileName,
    setSaveFileName,
    canvasWidth,
    canvasHeight,
    error,
    windowTitle,
    isXpTheme,
    handleUndo,
    handleRedo,
    handleClear,
    handleNewFile,
    handleConfirmNew,
    handleSave,
    handleSaveSubmit,
    handleImportFile,
    handleExportFile,
    handleFileSelect,
    handleCut,
    handleCopy,
    handlePaste,
    handleContentChange,
    handleApplyFilter,
    handleCanvasRef,
  } = usePaintLogic({ initialData, instanceId });

  const menuBar = (
    <PaintMenuBar
      isWindowOpen={isWindowOpen}
      isForeground={isForeground}
      onClose={onClose}
      canUndo={canUndo}
      canRedo={canRedo}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onClear={handleClear}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewFile={handleNewFile}
      onSave={handleSave}
      onImportFile={handleImportFile}
      onExportFile={handleExportFile}
      hasUnsavedChanges={hasUnsavedChanges}
      currentFilePath={currentFilePath}
      handleFileSelect={handleFileSelect}
      onCut={handleCut}
      onCopy={handleCopy}
      onPaste={handlePaste}
      onApplyFilter={handleApplyFilter}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="paint"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          className="flex flex-col h-full w-full min-h-0 p-2"
          style={{
            backgroundImage: 'url("/patterns/Property 1=7.svg")',
            backgroundRepeat: "repeat",
            backgroundColor: "#c0c0c0",
          }}
        >
          <div className="flex flex-1 gap-2 w-full min-h-0 px-1">
            <div className="flex flex-col gap-2 w-[84px] shrink-0">
              <div className="bg-white border border-black w-full shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]">
                <PaintToolbar
                  selectedTool={selectedTool}
                  onToolSelect={handleToolSelect}
                />
              </div>
              <div className="bg-white border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]">
                <PaintStrokeSettings
                  strokeWidth={strokeWidth}
                  onStrokeWidthChange={setStrokeWidth}
                />
              </div>
            </div>

            <div className="flex flex-col flex-1 gap-2 min-h-0 min-w-0">
              <div className="flex-1 bg-white min-h-0 min-w-0 border border-black border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)] overflow-auto relative">
                {error && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-red-500 p-4">
                    Error: {error}
                  </div>
                )}
                <PaintCanvas
                  ref={handleCanvasRef}
                  selectedTool={selectedTool}
                  selectedPattern={selectedPattern}
                  strokeWidth={strokeWidth}
                  onCanUndoChange={setCanUndo}
                  onCanRedoChange={setCanRedo}
                  onContentChange={handleContentChange}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  isForeground={isForeground}
                />
              </div>

              <div className="h-[58px] bg-white border-black flex items-center border-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]">
                <div className="border-r border-black h-full px-3 flex items-center">
                  <div className="w-[36px] h-[32px] border border-black shrink-0">
                    <img
                      src={`/patterns/Property 1=${
                        selectedPattern.split("-")[1]
                      }.svg`}
                      alt="Selected Pattern"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="flex-1 h-full min-w-0 translate-y-[-1px]">
                  <PaintPatternPalette
                    selectedPattern={selectedPattern}
                    onPatternSelect={setSelectedPattern}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </WindowFrame>
      <InputDialog
        isOpen={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSubmit={handleSaveSubmit}
        title="Save Image"
        description="Enter a name for your image"
        value={saveFileName}
        onChange={setSaveFileName}
      />
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        helpItems={translatedHelpItems}
        appId="paint"
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="paint"
      />
      <ConfirmDialog
        isOpen={isConfirmNewDialogOpen}
        onOpenChange={setIsConfirmNewDialogOpen}
        onConfirm={handleConfirmNew}
        title={t("apps.paint.dialogs.discardChanges")}
        description={t("apps.paint.dialogs.discardChangesDescription")}
      />
    </>
  );
};
