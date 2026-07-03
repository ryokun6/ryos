import type { Track } from "@/shared/media/library";

export interface CoverFlowUiState {
  selectedIndex: number;
  showCD: boolean;
  isFlipped: boolean;
  isFlipAnimating: boolean;
  selectedTrackInAlbum: number;
}

export type CoverFlowUiAction =
  | {
      type: "setSelectedIndex";
      value: number | ((prev: number) => number);
    }
  | { type: "setShowCD"; value: boolean }
  | { type: "setIsFlipped"; value: boolean }
  | { type: "setIsFlipAnimating"; value: boolean }
  | {
      type: "setSelectedTrackInAlbum";
      value: number | ((prev: number) => number);
    };

export interface CoverFlowProps {
  tracks: Track[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
  onExit: () => void;
  onRotation: () => void;
  isVisible: boolean;
  /** Use iPod-specific styling (fixed sizes, ipod-force-font) */
  ipodMode?: boolean;
  /** Whether the track is currently playing (for CD spin animation) */
  isPlaying?: boolean;
  /** Callback to toggle play/pause */
  onTogglePlay?: () => void;
  /** Callback to play a specific track without exiting CoverFlow */
  onPlayTrackInPlace?: (index: number) => void;
  /** Group Apple Music tracks into album covers instead of per-song covers. */
  groupAppleMusicAlbums?: boolean;
  /**
   * Render inline inside a host panel (e.g. the modern iPod menu
   * panel) instead of a full-screen `AnimatePresence` overlay. In
   * this mode CoverFlow drops its own bezel / status bar / fade
   * animation so the host's chrome can run the menu↔nowplaying width
   * transition without us drawing a competing border or background.
   */
  inline?: boolean;
}

export interface CoverFlowItem {
  key: string;
  track: Track;
  trackIndex: number;
  trackIndices: number[];
  title: string;
  artist?: string;
}

export interface CoverFlowRef {
  navigateNext: () => void;
  navigatePrevious: () => void;
  selectCurrent: () => void;
  /**
   * Handle a "back" press (Menu button on the wheel). Returns `true`
   * when Cover Flow consumed the press — currently only when the
   * album cover is flipped to its tracklist, in which case the press
   * unflips back to the carousel instead of exiting Cover Flow.
   * Returns `false` otherwise so the caller can run its default exit
   * behavior.
   */
  handleMenuButton: () => boolean;
}

export type CoverFlowComponentProps = CoverFlowProps & {
  ref?: React.Ref<CoverFlowRef>;
};
