// Shared types for the iPod app

import type { Track } from "@/stores/useIpodStore";
import type { LyricsAlignment, LyricsFont, KoreanDisplay, JapaneseFurigana, RomanizationSettings, DisplayMode } from "@/types/lyrics";
import type ReactPlayer from "react-player";
import type { useLyrics } from "@/hooks/useLyrics";
import type { FuriganaSegment } from "@/utils/romanization";
import type { ActivityInfo } from "@/hooks/useActivityLabel";

// Wheel interaction types
export type WheelArea = "top" | "right" | "bottom" | "left" | "center";
export type RotationDirection = "clockwise" | "counterclockwise";

// Menu item type
export interface MenuItem {
  label: string;
  action: () => void;
  showChevron?: boolean;
  value?: string;
}

// Menu history entry
export interface MenuHistoryEntry {
  title: string;
  items: MenuItem[];
  selectedIndex: number;
}

// PIP Player props
export interface PipPlayerProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onRestore: () => void;
}

// Fullscreen portal props
export interface FullScreenPortalProps {
  children:
    | React.ReactNode
    | ((ctx: {
        controlsVisible: boolean;
        isLangMenuOpen: boolean;
      }) => React.ReactNode);
  onClose: () => void;
  togglePlay: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTime: (delta: number) => void;
  showStatus: (message: string) => void;
  showOfflineStatus: () => void;
  registerActivity: () => void;
  isPlaying: boolean;
  statusMessage: string | null;
  disableTapToPlayPause?: boolean;
  // Fullscreen lyrics controls
  currentTranslationCode: string | null;
  onSelectTranslation: (code: string | null) => void;
  currentAlignment: LyricsAlignment;
  onCycleAlignment: () => void;
  currentLyricsFont: LyricsFont;
  onCycleLyricsFont: () => void;
  // Romanization/Pronunciation settings
  romanization?: RomanizationSettings;
  onRomanizationChange?: (settings: Partial<RomanizationSettings>) => void;
  // Sync mode (lyrics timing)
  onSyncMode?: () => void;
  isSyncModeOpen?: boolean;
  syncModeContent?: React.ReactNode;
  // Display mode (Karaoke only - video, cover, mesh, water, etc.)
  displayMode?: DisplayMode;
  onDisplayModeSelect?: (mode: DisplayMode) => void;
  displayModeOptions?: { value: DisplayMode; label: string }[];
  // Player ref for mobile Safari handling
  fullScreenPlayerRef: React.RefObject<ReactPlayer | null>;
  /** Activity state for loading indicators */
  activityState: ActivityInfo;
}

// IpodScreen props
export interface IpodScreenProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  elapsedTime: number;
  totalTime: number;
  menuMode: boolean;
  menuHistory: MenuHistoryEntry[];
  selectedMenuItem: number;
  onSelectMenuItem: (index: number) => void;
  currentIndex: number;
  tracksLength: number;
  backlightOn: boolean;
  menuDirection: "forward" | "backward";
  onMenuItemAction: (action: () => void) => void;
  showVideo: boolean;
  displayMode: DisplayMode;
  playerRef: React.RefObject<ReactPlayer | null>;
  handleTrackEnd: () => void;
  handleProgress: (state: { playedSeconds: number }) => void;
  handleDuration: (duration: number) => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleReady: () => void;
  loopCurrent: boolean;
  statusMessage: string | null;
  onToggleVideo: () => void;
  lcdFilterOn: boolean;
  ipodVolume: number;
  showStatusCallback: (message: string) => void;
  showLyrics: boolean;
  lyricsAlignment: LyricsAlignment;
  koreanDisplay: KoreanDisplay;
  japaneseFurigana: JapaneseFurigana;
  lyricOffset: number;
  adjustLyricOffset: (deltaMs: number) => void;
  registerActivity: () => void;
  isFullScreen: boolean;
  lyricsControls: ReturnType<typeof useLyrics>;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
  /** Furigana map from parent (Map of startTimeMs -> FuriganaSegment[]) */
  furiganaMap?: Map<string, FuriganaSegment[]>;
  /** Soramimi map from parent (Map of startTimeMs -> FuriganaSegment[]) */
  soramimiMap?: Map<string, FuriganaSegment[]>;
  /** Activity state for loading indicators */
  activityState: ActivityInfo;
}

// Battery manager interface for browsers that expose navigator.getBattery
export interface BatteryManager {
  charging: boolean;
  level: number;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}
