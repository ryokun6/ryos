import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { helpItems } from "..";

export type MapsMapType = "standard" | "hybrid" | "satellite" | "mutedStandard";

// Map ryOS i18n language codes to MapKit JS supported BCP-47 tags. MapKit
// understands a wide range of tags but is strict about formatting; we
// normalize here so the on-map labels follow the user's UI language.
function ryOSLocaleToMapKitLanguage(locale: string | undefined): string {
  if (!locale) return "en";
  const lower = locale.toLowerCase();
  if (lower.startsWith("zh-tw") || lower === "zh-hant") return "zh-Hant";
  if (lower.startsWith("zh-cn") || lower === "zh-hans") return "zh-Hans";
  if (lower.startsWith("zh")) return "zh-Hant";
  if (lower.startsWith("pt-br")) return "pt-BR";
  if (lower.startsWith("en-gb")) return "en-GB";
  // For everything else use the primary subtag (e.g. "ja", "ko", "fr").
  return lower.split("-")[0] ?? "en";
}

export function useMapsLogic() {
  const { t, i18n } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("maps", helpItems);
  const {
    currentTheme,
    isXpTheme,
    isMacOSTheme,
    isSystem7Theme,
    isClassicTheme,
  } = useThemeFlags();

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [mapType, setMapType] = useState<MapsMapType>("standard");

  const mapKitLanguage = ryOSLocaleToMapKitLanguage(i18n.language);

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isMacOSTheme,
    isSystem7Theme,
    isClassicTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    mapType,
    setMapType,
    mapKitLanguage,
  };
}
