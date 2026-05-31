import { useTranslation } from "react-i18next";
import { DotsThree } from "@phosphor-icons/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { toggleExposeView } from "@/utils/appEventBus";

export function ExposeButton() {
  const { t } = useTranslation();
  const { isWindowsTheme: isXpTheme } = useThemeFlags();

  // Don't show on Windows themes (they have their own taskbar)
  if (isXpTheme) return null;

  const handleClick = () => {
    toggleExposeView();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center justify-center px-1.5 py-0.5"
      style={{
        marginRight: "4px",
      }}
      title={t("common.menuBar.missionControl")}
      aria-label={t("common.menuBar.missionControl")}
    >
      <DotsThree aria-hidden="true" className="h-4 w-4" weight="bold" />
    </button>
  );
}
