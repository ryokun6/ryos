import { cn } from "@/lib/utils";
import { useSound, Sounds } from "@/hooks/useSound";
import { ChannelStepIsland } from "./ChannelStepIsland";
import { CloseIsland } from "./CloseIsland";
import { LyricsControlsIsland } from "./LyricsControlsIsland";
import { PlaybackControlsIsland } from "./PlaybackControlsIsland";
import { useFullscreenPlayerControlStyles } from "./useFullscreenPlayerControlStyles";
import type { FullscreenPlayerControlsProps } from "./types";

export function FullscreenPlayerControls({
  isPlaying,
  onPrevious,
  onPlayPause,
  onNext,
  isShuffled,
  onToggleShuffle,
  displayMode,
  onDisplayModeSelect,
  displayModeOptions,
  onSyncMode,
  currentAlignment,
  onAlignmentCycle,
  currentFont,
  onFontCycle,
  romanization,
  onRomanizationChange,
  isPronunciationMenuOpen = false,
  setIsPronunciationMenuOpen,
  currentTranslationCode,
  onTranslationSelect,
  translationLanguages,
  isLangMenuOpen,
  setIsLangMenuOpen,
  onChannelUp,
  onChannelDown,
  channelUpTitle,
  channelDownTitle,
  channelUpLabel,
  channelDownLabel,
  onClose,
  variant = "responsive",
  bgOpacity = "35",
  onInteraction,
  portalContainer,
  hideLyricsControls = false,
}: FullscreenPlayerControlsProps) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const styles = useFullscreenPlayerControlStyles(variant, bgOpacity);

  const handleClick =
    (handler: () => void) => (e: React.MouseEvent) => {
      e.stopPropagation();
      playClick();
      onInteraction?.();
      handler();
    };

  const showChannelStep =
    onChannelUp &&
    onChannelDown &&
    channelUpLabel &&
    channelDownLabel;

  return (
    <div
      className={cn(
        "relative ipod-force-font flex items-center",
        variant === "compact" ? "gap-2" : "gap-2 md:gap-3"
      )}
    >
      <PlaybackControlsIsland
        isPlaying={isPlaying}
        onPrevious={onPrevious}
        onPlayPause={onPlayPause}
        onNext={onNext}
        isShuffled={isShuffled}
        onToggleShuffle={onToggleShuffle}
        displayMode={displayMode}
        onDisplayModeSelect={onDisplayModeSelect}
        displayModeOptions={displayModeOptions}
        styles={styles}
        handleClick={handleClick}
      />

      {showChannelStep && (
        <ChannelStepIsland
          onChannelUp={onChannelUp}
          onChannelDown={onChannelDown}
          channelUpTitle={channelUpTitle}
          channelDownTitle={channelDownTitle}
          channelUpLabel={channelUpLabel}
          channelDownLabel={channelDownLabel}
          styles={styles}
          handleClick={handleClick}
        />
      )}

      {!hideLyricsControls && (
        <LyricsControlsIsland
          onSyncMode={onSyncMode}
          currentAlignment={currentAlignment}
          onAlignmentCycle={onAlignmentCycle}
          currentFont={currentFont}
          onFontCycle={onFontCycle}
          romanization={romanization}
          onRomanizationChange={onRomanizationChange}
          isPronunciationMenuOpen={isPronunciationMenuOpen}
          setIsPronunciationMenuOpen={setIsPronunciationMenuOpen}
          currentTranslationCode={currentTranslationCode}
          onTranslationSelect={onTranslationSelect}
          translationLanguages={translationLanguages}
          isLangMenuOpen={isLangMenuOpen}
          setIsLangMenuOpen={setIsLangMenuOpen}
          portalContainer={portalContainer}
          onInteraction={onInteraction}
          styles={styles}
          handleClick={handleClick}
        />
      )}

      {onClose && (
        <CloseIsland
          onClose={onClose}
          styles={styles}
          handleClick={handleClick}
        />
      )}
    </div>
  );
}
