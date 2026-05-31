import { useCallback } from "react";
import { TvMenuBar } from "../TvMenuBar";
import type { CustomChannel } from "@/stores/useTvStore";
import type { Channel } from "../../data/channels";

export function useTvMenuBar({
  onClose,
  customChannels,
  setIsHelpDialogOpen,
  setIsAboutDialogOpen,
  channels,
  hasResettableChannelChanges,
  currentChannelId,
  setChannelById,
  ensureLoggedIn,
  setIsCreateChannelOpen,
  setPendingDeleteId,
  handleImportChannels,
  handleExportChannels,
  setIsResetConfirmOpen,
  lcdFilterOn,
  toggleLcdFilter,
  closedCaptionsOn,
  toggleClosedCaptions,
  isDrawerOpen,
  setIsDrawerOpen,
  isPlaying,
  handleTogglePlay,
  nextVideo,
  prevVideo,
  nextChannel,
  prevChannel,
  toggleFullScreen,
}: {
  onClose?: () => void;
  customChannels: CustomChannel[];
  setIsHelpDialogOpen: (value: boolean) => void;
  setIsAboutDialogOpen: (value: boolean) => void;
  channels: Channel[];
  hasResettableChannelChanges: boolean;
  currentChannelId: string;
  setChannelById: (id: string) => void;
  ensureLoggedIn: () => boolean;
  setIsCreateChannelOpen: (value: boolean) => void;
  setPendingDeleteId: (value: string | null) => void;
  handleImportChannels: () => void;
  handleExportChannels: () => void;
  setIsResetConfirmOpen: (value: boolean) => void;
  lcdFilterOn: boolean;
  toggleLcdFilter: () => void;
  closedCaptionsOn: boolean;
  toggleClosedCaptions: () => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (
    value: boolean | ((prev: boolean) => boolean)
  ) => void;
  isPlaying: boolean;
  handleTogglePlay: () => void;
  nextVideo: () => void;
  prevVideo: () => void;
  nextChannel: () => void;
  prevChannel: () => void;
  toggleFullScreen: () => void;
}) {
  const toggleDrawer = useCallback(() => {
    setIsDrawerOpen((v) => !v);
  }, [setIsDrawerOpen]);

  const menuBar = (
    <TvMenuBar
      onClose={onClose ?? (() => {})}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      channels={channels}
      hasCustomChannels={customChannels.length > 0}
      canResetChannels={hasResettableChannelChanges}
      currentChannelId={currentChannelId}
      onSelectChannel={setChannelById}
      onCreateChannel={() => {
        if (!ensureLoggedIn()) return;
        setIsCreateChannelOpen(true);
      }}
      onDeleteChannel={(id) => setPendingDeleteId(id)}
      onImportChannels={handleImportChannels}
      onExportChannels={handleExportChannels}
      onResetChannels={() => setIsResetConfirmOpen(true)}
      isLcdFilterOn={lcdFilterOn}
      onToggleLcdFilter={toggleLcdFilter}
      closedCaptionsOn={closedCaptionsOn}
      onToggleClosedCaptions={toggleClosedCaptions}
      isDrawerOpen={isDrawerOpen}
      onToggleDrawer={toggleDrawer}
      isPlaying={isPlaying}
      onTogglePlay={handleTogglePlay}
      onNextVideo={nextVideo}
      onPrevVideo={prevVideo}
      onNextChannel={nextChannel}
      onPrevChannel={prevChannel}
      onFullScreen={toggleFullScreen}
    />
  );

  return { menuBar, toggleDrawer };
}
