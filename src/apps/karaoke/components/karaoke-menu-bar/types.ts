import type { Track } from "@/shared/media/library";

/** Props for the Karaoke app menubar shell (`karaoke-menu-bar/`). */
export interface KaraokeMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onAddSong: () => void;
  onShareSong: () => void;
  onStartListenSession: () => void;
  onJoinListenSession: () => void;
  onShareListenSession: () => void;
  onLeaveListenSession: () => void;
  isInListenSession: boolean;
  isListenSessionHost: boolean;
  onClearLibrary: () => void;
  onSyncLibrary: () => void;
  onPlayTrack: (index: number) => void;
  onTogglePlay: () => void;
  onPreviousTrack: () => void;
  onNextTrack: () => void;
  isPlaying: boolean;
  isShuffled: boolean;
  onToggleShuffle: () => void;
  loopAll: boolean;
  onToggleLoopAll: () => void;
  loopCurrent: boolean;
  onToggleLoopCurrent: () => void;
  showLyrics: boolean;
  onToggleLyrics: () => void;
  onToggleFullScreen: () => void;
  onRefreshLyrics?: () => void;
  onAdjustTiming?: () => void;
  onToggleCoverFlow?: () => void;
  tracks: Track[];
  currentIndex: number;
}
