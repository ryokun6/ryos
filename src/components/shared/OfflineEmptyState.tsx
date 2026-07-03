import { useTranslation } from "react-i18next";
import { WifiSlash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export interface OfflineEmptyStateProps {
  /** Translated app name interpolated into the description. */
  appName: string;
  /**
   * Visual treatment for the surface the state renders on:
   * "light" for light window surfaces, "dark" for black media surfaces.
   */
  appearance?: "light" | "dark";
  className?: string;
}

/**
 * Shared full-pane empty state for apps that fundamentally require an
 * internet connection (Maps, Videos, TV, Internet Explorer, emulators, …).
 * Render it in place of — or as an overlay above — the app's main content
 * while `useOffline()` reports the browser is offline.
 */
export function OfflineEmptyState({
  appName,
  appearance = "light",
  className,
}: OfflineEmptyStateProps) {
  const { t } = useTranslation();
  const isDark = appearance === "dark";

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center select-none font-os-ui",
        className
      )}
    >
      <WifiSlash
        className={cn(
          "size-10",
          isDark ? "text-white/40" : "text-neutral-400"
        )}
        weight="bold"
      />
      <p
        className={cn(
          "text-sm font-semibold",
          isDark ? "text-white/90" : "text-neutral-800"
        )}
      >
        {t("common.offline.title")}
      </p>
      <p
        className={cn(
          "text-xs max-w-xs",
          isDark ? "text-white/60" : "text-neutral-500"
        )}
      >
        {t("common.offline.appRequiresInternet", { appName })}
      </p>
    </div>
  );
}
