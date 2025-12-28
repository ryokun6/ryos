/**
 * Hook to compute activity indicator label based on loading states.
 * Centralizes the logic for determining what label to show.
 */

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

export interface ActivityInfo {
  isLoadingLyrics?: boolean;
  isTranslating?: boolean;
  translationProgress?: number;
  translationLanguage?: string | null;
  isFetchingFurigana?: boolean;
  furiganaProgress?: number;
  isFetchingSoramimi?: boolean;
  soramimiProgress?: number;
  isAddingSong?: boolean;
}

export interface ActivityLabelResult {
  /** Whether any activity is in progress */
  isActive: boolean;
  /** Label to display (e.g., "45% English") */
  label: string | null;
}

/** Translation function type */
type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

/**
 * Computes the activity label based on current loading states.
 * Priority: Adding > Translation (with progress) > Soramimi > Furigana > Translation (no progress)
 * @param info - Activity state information
 * @param t - Optional translation function for i18n support
 */
export function getActivityLabel(info: ActivityInfo, t?: TranslationFn): ActivityLabelResult {
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
  } = info;

  const isActive = !!(isLoadingLyrics || isTranslating || isFetchingFurigana || isFetchingSoramimi || isAddingSong);
  
  if (!isActive) {
    return { isActive: false, label: null };
  }

  // Helper to translate or return fallback
  const translate = (key: string, fallback: string) => t ? t(key, { defaultValue: fallback }) : fallback;

  let label: string | null = null;

  // Simple priority: Adding > Translation > Soramimi > Furigana
  if (isAddingSong) {
    label = translate("common.activity.adding", "Adding");
  } else if (isTranslating) {
    const langName = translationLanguage ? (languageNames[translationLanguage] || translationLanguage) : null;
    if (translationProgress !== undefined && translationProgress < 100) {
      label = langName ? `${Math.round(translationProgress)}% ${langName}` : `${Math.round(translationProgress)}%`;
    } else {
      label = langName;
    }
  } else if (isFetchingSoramimi) {
    const soramimiLabel = translate("common.activity.soramimi", "Misheard");
    if (soramimiProgress !== undefined && soramimiProgress < 100) {
      label = `${Math.round(soramimiProgress)}% ${soramimiLabel}`;
    } else {
      label = soramimiLabel;
    }
  } else if (isFetchingFurigana) {
    const furiganaLabel = translate("common.activity.furigana", "Furigana");
    if (furiganaProgress !== undefined && furiganaProgress < 100) {
      label = `${Math.round(furiganaProgress)}% ${furiganaLabel}`;
    } else {
      label = furiganaLabel;
    }
  }

  return { isActive, label };
}
