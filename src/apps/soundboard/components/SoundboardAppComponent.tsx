import { WindowFrame } from "@/components/layout/WindowFrame";
import { BoardList } from "./BoardList";
import { SoundGrid } from "./SoundGrid";
import { EmojiDialog } from "@/components/dialogs/EmojiDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { AppProps } from "../../base/types";
import { SoundboardMenuBar } from "./SoundboardMenuBar";
import { appMetadata } from "../metadata";
import { getTranslatedAppName } from "@/utils/i18n";
import { useSoundboardLogic } from "../hooks/useSoundboardLogic";

export function SoundboardAppComponent({
  onClose,
  isWindowOpen,
  isForeground,
  helpItems = [],
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    translatedHelpItems,
    boards,
    activeBoard,
    activeBoardId,
    playbackStates,
    setActiveBoardId,
    addNewBoard,
    updateBoardName,
    updateSlot,
    deleteSlot,
    hasInitialized,
    isXpTheme,
    isEditingTitle,
    setIsEditingTitle,
    dialogState,
    setDialogState,
    helpDialogOpen,
    setHelpDialogOpen,
    aboutDialogOpen,
    setAboutDialogOpen,
    audioDevices,
    importInputRef,
    showWaveforms,
    setShowWaveforms,
    showEmojis,
    setShowEmojis,
    micPermissionGranted,
    selectedDeviceId,
    storeSetSelectedDeviceId,
    storeDeleteBoard,
    handleSlotClick,
    handleDialogSubmit,
    handleImportBoard,
    exportBoard,
    reloadFromJson,
    reloadFromAllSounds,
  } = useSoundboardLogic({ helpItems, isForeground });

  const menuBar = (
    <SoundboardMenuBar
      onClose={onClose}
      isWindowOpen={isWindowOpen}
      onNewBoard={addNewBoard}
      onImportBoard={() => importInputRef.current?.click()}
      onExportBoard={exportBoard}
      onReloadBoard={reloadFromJson}
      onReloadAllSounds={reloadFromAllSounds}
      onRenameBoard={() => setIsEditingTitle(true)}
      onDeleteBoard={() => {
        if (activeBoardId && boards.length > 1) {
          storeDeleteBoard(activeBoardId);
        }
      }}
      canDeleteBoard={boards.length > 1}
      onShowHelp={() => setHelpDialogOpen(true)}
      onShowAbout={() => setAboutDialogOpen(true)}
      showWaveforms={showWaveforms}
      onToggleWaveforms={setShowWaveforms}
      showEmojis={showEmojis}
      onToggleEmojis={setShowEmojis}
    />
  );

  if (!hasInitialized || !activeBoard || !activeBoardId) {
    return (
      <WindowFrame
        title={getTranslatedAppName("soundboard")}
        onClose={onClose}
        isForeground={isForeground}
        appId="soundboard"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex-1 flex items-center justify-center">
          {!hasInitialized
            ? "Initializing soundboard..."
            : "Loading soundboard..."}
        </div>
      </WindowFrame>
    );
  }

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={
          isEditingTitle
            ? getTranslatedAppName("soundboard")
            : activeBoard?.name ||
              `${getTranslatedAppName("soundboard")} ${activeBoardId}`
        }
        onClose={onClose}
        isForeground={isForeground}
        appId="soundboard"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{
          minHeight: window.innerWidth >= 768 ? 475 : 625,
        }}
      >
        <div
          className={`h-full w-full flex flex-col md:flex-row ${
            isXpTheme ? "border-t border-[#919b9c]" : ""
          }`}
        >
          <input
            type="file"
            ref={importInputRef}
            className="hidden"
            accept="application/json"
            onChange={handleImportBoard}
          />

          <BoardList
            boards={boards}
            activeBoardId={activeBoardId}
            onBoardSelect={setActiveBoardId}
            onNewBoard={addNewBoard}
            selectedDeviceId={selectedDeviceId || ""}
            onDeviceSelect={storeSetSelectedDeviceId}
            audioDevices={audioDevices}
            micPermissionGranted={micPermissionGranted}
          />

          <SoundGrid
            board={activeBoard}
            playbackStates={playbackStates}
            isEditingTitle={isEditingTitle}
            onTitleChange={(name) => updateBoardName(name)}
            onTitleBlur={(name) => {
              updateBoardName(name);
              setIsEditingTitle(false);
            }}
            onTitleKeyDown={(e) => {
              if (e.key === "Enter") {
                updateBoardName(e.currentTarget.value);
                setIsEditingTitle(false);
              }
            }}
            onSlotClick={handleSlotClick}
            onSlotDelete={deleteSlot}
            onSlotEmojiClick={(index) =>
              setDialogState({
                type: "emoji",
                isOpen: true,
                slotIndex: index,
                value: activeBoard.slots[index]?.emoji || "",
              })
            }
            onSlotTitleClick={(index) =>
              setDialogState({
                type: "title",
                isOpen: true,
                slotIndex: index,
                value: activeBoard.slots[index]?.title || "",
              })
            }
            setIsEditingTitle={setIsEditingTitle}
            showWaveforms={showWaveforms}
            showEmojis={showEmojis}
          />
        </div>

        <EmojiDialog
          isOpen={dialogState.isOpen && dialogState.type === "emoji"}
          onOpenChange={(open) =>
            setDialogState((prev) => ({ ...prev, isOpen: open }))
          }
          onEmojiSelect={(emoji) => {
            if (activeBoardId) {
              updateSlot(dialogState.slotIndex, { emoji });
            }
            setDialogState((prev) => ({ ...prev, isOpen: false }));
          }}
        />

        <InputDialog
          isOpen={dialogState.isOpen && dialogState.type === "title"}
          onOpenChange={(open) =>
            setDialogState((prev) => ({ ...prev, isOpen: open }))
          }
          onSubmit={handleDialogSubmit}
          title="Set Title"
          description="Enter a title for this sound slot"
          value={dialogState.value}
          onChange={(value) => setDialogState((prev) => ({ ...prev, value }))}
        />

        <HelpDialog
          isOpen={helpDialogOpen}
          onOpenChange={setHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="soundboard"
        />
        <AboutDialog
          isOpen={aboutDialogOpen}
          onOpenChange={setAboutDialogOpen}
          metadata={appMetadata}
          appId="soundboard"
        />
      </WindowFrame>
    </>
  );
}
