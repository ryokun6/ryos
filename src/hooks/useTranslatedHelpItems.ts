import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/utils/i18n";
import { HELP_ITEM_KEYS_BY_APP_ID } from "@/hooks/helpItemKeys";

/**
 * Hook to get translated help items for an app
 * Merges translated text with original icons
 */
export function useTranslatedHelpItems(
  appId: AppId,
  originalHelpItems: Array<{ icon: string; title: string; description: string }>
) {
  const { t } = useTranslation();

  return useMemo(() => {
    const keys = HELP_ITEM_KEYS_BY_APP_ID[appId] || [];
    return originalHelpItems.map((item, index) => {
      const key = keys[index];
      if (!key) return item; // Fallback to original if no key

      const titleKey = `apps.${appId}.help.${key}.title`;
      const descKey = `apps.${appId}.help.${key}.description`;

      return {
        icon: item.icon, // Keep original icon
        title: t(titleKey, { defaultValue: item.title }),
        description: t(descKey, { defaultValue: item.description }),
      };
    });
  }, [appId, originalHelpItems, t]);
}
