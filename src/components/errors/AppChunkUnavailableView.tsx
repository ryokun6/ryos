import { WifiSlash } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import type { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { Button } from "@/components/ui/button";
import type { AppId } from "@/config/appRegistryData";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getTranslatedAppName } from "@/utils/i18n";

type AppChunkUnavailableViewProps = AppProps & {
  appId: AppId;
  isOffline: boolean;
  isRetrying: boolean;
  onRetry: () => void;
};

export function AppChunkUnavailableView({
  appId,
  isOffline,
  isRetrying,
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
  onRetry,
}: AppChunkUnavailableViewProps) {
  const { t } = useTranslation();
  const { isWindowsTheme } = useThemeFlags();
  const appName = getTranslatedAppName(appId);

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={null}
      windowFrameProps={{
        title: appName,
        onClose,
        isForeground,
        appId,
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
    >
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
        <WifiSlash className="size-10 text-neutral-400" weight="bold" />
        <h2 className="text-sm font-bold">
          {t("common.errorBoundaries.offlineHeading", {
            appName,
            defaultValue: "{{appName}} isn't available offline yet",
          })}
        </h2>
        <p className="max-w-xs text-xs text-neutral-500">
          {t("common.errorBoundaries.offlineDescription", {
            defaultValue:
              "Connect once to download this app, then you can open it offline.",
          })}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={onRetry}
          disabled={isOffline || isRetrying}
        >
          {isRetrying
            ? t("common.loading.default", { defaultValue: "Loading…" })
            : t("common.errorBoundaries.retry", {
                defaultValue: "Try Again",
              })}
        </Button>
      </div>
    </AppWindowShell>
  );
}
