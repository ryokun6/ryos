import type { LyricsAlignment, RomanizationSettings } from "@/types/lyrics";
import { DisplayMode, LyricsFont } from "@/types/lyrics";

export interface TranslationLanguageOption {
  label: string;
  code: string | null;
  separator?: boolean;
}

export interface FullscreenPlayerControlsProps {
  // Playback state
  isPlaying: boolean;

  // Transport controls
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;

  // Shuffle
  isShuffled?: boolean;
  onToggleShuffle?: () => void;

  // Display mode (background: video, cover, mesh, water, etc.)
  displayMode?: DisplayMode;
  onDisplayModeSelect?: (mode: DisplayMode) => void;
  displayModeOptions?: { value: DisplayMode; label: string }[];

  // Sync mode (lyrics timing)
  onSyncMode?: () => void;

  // Lyrics alignment
  currentAlignment: LyricsAlignment;
  onAlignmentCycle: () => void;

  // Font style
  currentFont: LyricsFont;
  onFontCycle: () => void;

  // Romanization/Pronunciation settings
  romanization?: RomanizationSettings;
  onRomanizationChange?: (settings: Partial<RomanizationSettings>) => void;
  isPronunciationMenuOpen?: boolean;
  setIsPronunciationMenuOpen?: (open: boolean) => void;

  // Translation
  currentTranslationCode: string | null;
  onTranslationSelect: (code: string | null) => void;
  translationLanguages: TranslationLanguageOption[];
  isLangMenuOpen: boolean;
  setIsLangMenuOpen: (open: boolean) => void;

  // Optional TV-style channel step (after transport, same visual language as other islands)
  onChannelUp?: () => void;
  onChannelDown?: () => void;
  channelUpTitle?: string;
  channelDownTitle?: string;
  channelUpLabel?: string;
  channelDownLabel?: string;

  onClose?: () => void;

  // Styling variants
  variant?: "compact" | "responsive";
  bgOpacity?: "35" | "60";

  // Activity callback (for auto-hide timers)
  onInteraction?: () => void;

  // Portal container for fullscreen mode (dropdown menus need to render inside the fullscreen element)
  portalContainer?: HTMLElement | null;

  // Hide lyrics controls island (for video players without lyrics)
  hideLyricsControls?: boolean;
}

export type FullscreenControlsVariant = NonNullable<
  FullscreenPlayerControlsProps["variant"]
>;

export interface FullscreenControlStyles {
  segmentClasses: string;
  aquaSegmentStyle: React.CSSProperties;
  buttonClasses: string;
  iconClasses: string;
  svgClasses: (baseClass?: string) => string;
  channelStepButtonClasses: string;
  smallIconSize: string;
  svgSize: number;
  svgSizeMd: number;
  variant: FullscreenControlsVariant;
  isMacTheme: boolean;
}

export type FullscreenControlClickHandler = (
  handler: () => void
) => (e: React.MouseEvent) => void;
