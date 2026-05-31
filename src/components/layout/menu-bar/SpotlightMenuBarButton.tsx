import { useTranslation } from "react-i18next";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSpotlightStore } from "@/stores/useSpotlightStore";
import { toggleSpotlightSearch } from "@/utils/appEventBus";

export function SpotlightMenuBarButton() {
  const { t } = useTranslation();
  const { isWindowsTheme: isXpTheme, isMacOSTheme } = useThemeFlags();
  const isSpotlightOpen = useSpotlightStore((state) => state.isOpen);

  // Only show on Mac themes — Windows themes use Start Menu "Run..."
  if (isXpTheme) return null;

  const handleClick = () => {
    toggleSpotlightSearch();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center justify-center"
      style={{
        marginLeft: "2px",
        marginRight: "4px",
        color: isSpotlightOpen ? "#FFFFFF" : "inherit",
        background: isSpotlightOpen
          ? isMacOSTheme
            ? "linear-gradient(180deg, #609de9 0%, #3d84e5 50%, #3170dc 100%)"
            : "#000000"
          : "transparent",
        borderRadius: "50%",
        width: "20px",
        height: "20px",
        padding: 0,
      }}
      title={t("spotlight.ariaLabels.spotlightSearch")}
      aria-label={t("spotlight.ariaLabels.spotlightSearch")}
    >
      <MagnifyingGlass
        aria-hidden="true"
        size={14}
        weight="bold"
      />
    </button>
  );
}
