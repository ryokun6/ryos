import { useTranslation } from "react-i18next";
import { WifiSlash } from "@phosphor-icons/react";
import { useOffline } from "@/hooks/useOffline";
import { useThemeFlags } from "@/hooks/useThemeFlags";

export function OfflineIndicator() {
  const { t } = useTranslation();
  const isOffline = useOffline();
  const { isWindowsTheme, isWin98 } = useThemeFlags();

  if (!isOffline) return null;

  return (
    <div
      className="flex items-center"
      style={{
        marginRight: isWindowsTheme ? "4px" : "8px",
        color:
          isWin98
            ? "#000000"
            : isWindowsTheme
            ? "#ffffff"
            : "var(--os-color-menubar-text)",
      }}
      title={t("common.menuBar.offline")}
    >
      <WifiSlash
        className={isWindowsTheme ? "h-3 w-3" : "h-4 w-4"}
        weight="bold"
        style={{
          opacity: 0.7,
        }}
      />
    </div>
  );
}
