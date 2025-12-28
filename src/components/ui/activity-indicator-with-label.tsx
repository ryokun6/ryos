import { cn } from "@/lib/utils";
import { ActivityIndicator } from "./activity-indicator";

export interface ActivityState {
  /** Whether currently loading lyrics */
  isLoadingLyrics?: boolean;
  /** Whether currently translating lyrics */
  isTranslating?: boolean;
  /** Translation progress percentage (0-100) */
  translationProgress?: number;
  /** Translation target language code (e.g., "en", "ja") */
  translationLanguage?: string | null;
  /** Whether currently fetching furigana */
  isFetchingFurigana?: boolean;
  /** Furigana progress percentage (0-100) */
  furiganaProgress?: number;
  /** Whether currently fetching soramimi */
  isFetchingSoramimi?: boolean;
  /** Soramimi progress percentage (0-100) */
  soramimiProgress?: number;
  /** Whether currently adding a song (searching or adding) */
  isAddingSong?: boolean;
}

interface ActivityIndicatorWithLabelProps {
  /** Activity state object containing all loading states */
  state: ActivityState;
  /** Size of the indicator */
  size?: "xs" | "sm" | "md" | "lg" | number;
  /** Additional CSS classes for the container */
  className?: string;
  /** Additional CSS classes for the label */
  labelClassName?: string;
}

// Map language codes to display names
const languageNames: Record<string, string> = {
  en: "English",
  ja: "日本語",
  ko: "한국어",
  "zh-CN": "中文",
  "zh-TW": "中文",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
};

/**
 * Activity indicator with an optional label showing what's being processed
 * Shows the type of processing (Furigana, English, Soramimi, etc.) with progress percentage
 */
export function ActivityIndicatorWithLabel({
  state,
  size = "md",
  className,
  labelClassName,
}: ActivityIndicatorWithLabelProps) {
  const {
    isLoadingLyrics,
    isTranslating,
    translationProgress,
    translationLanguage,
    isFetchingFurigana,
    furiganaProgress,
    isFetchingSoramimi,
    soramimiProgress,
    isAddingSong,
  } = state;

  // Determine what to show based on active state
  // Priority: Adding > Soramimi > Furigana > Translation > Loading
  let label: string | null = null;
  
  if (isAddingSong) {
    label = "Adding...";
  } else if (isFetchingSoramimi && soramimiProgress !== undefined && soramimiProgress < 100) {
    label = `Soramimi ${Math.round(soramimiProgress)}%`;
  } else if (isFetchingFurigana && furiganaProgress !== undefined && furiganaProgress < 100) {
    label = `Furigana ${Math.round(furiganaProgress)}%`;
  } else if (isTranslating && translationProgress !== undefined && translationProgress < 100) {
    const langName = translationLanguage ? (languageNames[translationLanguage] || translationLanguage) : "";
    label = langName ? `${langName} ${Math.round(translationProgress)}%` : `${Math.round(translationProgress)}%`;
  } else if (isFetchingSoramimi) {
    label = "Soramimi";
  } else if (isFetchingFurigana) {
    label = "Furigana";
  } else if (isTranslating) {
    const langName = translationLanguage ? (languageNames[translationLanguage] || translationLanguage) : "";
    label = langName || null;
  }

  // Don't render if nothing is happening
  const isActive = isLoadingLyrics || isTranslating || isFetchingFurigana || isFetchingSoramimi || isAddingSong;
  if (!isActive) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ActivityIndicator
        size={size}
        className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
      />
      {label && (
        <span
          className={cn(
            "font-chicago text-white text-[min(3vw,3vh,14px)] whitespace-nowrap",
            "drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]",
            "[text-shadow:_0_1px_0_rgba(0,0,0,0.8),_0_-1px_0_rgba(0,0,0,0.8),_1px_0_0_rgba(0,0,0,0.8),_-1px_0_0_rgba(0,0,0,0.8)]",
            labelClassName
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default ActivityIndicatorWithLabel;
