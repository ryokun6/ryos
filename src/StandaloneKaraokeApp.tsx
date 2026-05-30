import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/sonner";
import { AppErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { DesktopErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { KaraokeAppComponent } from "@/apps/karaoke/components/KaraokeAppComponent";
import { appRegistry } from "@/config/appRegistry";
import { useAppStoreShallow } from "@/stores/helpers";
import { useOffline } from "@/hooks/useOffline";
import { applyDisplayMode } from "@/utils/displayMode";
import { useDisplaySettingsStoreShallow } from "@/stores/helpers";
import { getTranslatedAppName } from "@/utils/i18n";
import { parseStandaloneKaraokeRoute } from "@/utils/standaloneKaraokeRoute";
import type { KaraokeInitialData } from "@/apps/base/types";

const KARAOKE_APP_ID = "karaoke" as const;

export function StandaloneKaraokeApp() {
  const { t } = useTranslation();
  const displayMode = useDisplaySettingsStoreShallow((state) => state.displayMode);
  useOffline();

  const routeInitialData = useMemo(
    () =>
      parseStandaloneKaraokeRoute(
        window.location.pathname,
        window.location.search
      ) ?? {},
    []
  );

  const launchedRef = useRef(false);

  const { instances, launchApp } = useAppStoreShallow((state) => ({
    instances: state.instances,
    launchApp: state.launchApp,
  }));

  useEffect(() => {
    applyDisplayMode(displayMode);
  }, [displayMode]);

  useEffect(() => {
    document.documentElement.dataset.standaloneKaraoke = "true";
    document.title = "Karaoke · ryOS";
    return () => {
      delete document.documentElement.dataset.standaloneKaraoke;
    };
  }, []);

  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    launchApp(KARAOKE_APP_ID, routeInitialData as KaraokeInitialData);
  }, [launchApp, routeInitialData]);

  const karaokeInstance = Object.values(instances).find(
    (instance) => instance.appId === KARAOKE_APP_ID && instance.isOpen
  );

  const appMeta = appRegistry[KARAOKE_APP_ID];
  const translatedAppName = getTranslatedAppName(KARAOKE_APP_ID);
  const crashDialogAppName =
    translatedAppName !== KARAOKE_APP_ID
      ? translatedAppName
      : (appMeta?.name ?? KARAOKE_APP_ID);

  return (
    <>
      <DesktopErrorBoundary>
        {karaokeInstance ? (
          <AppErrorBoundary
            appId={KARAOKE_APP_ID}
            appName={crashDialogAppName}
            instanceId={karaokeInstance.instanceId}
            onQuit={() => {
              window.location.href = "/";
            }}
            onRelaunch={() => {
              launchApp(KARAOKE_APP_ID, routeInitialData as KaraokeInitialData);
            }}
          >
            <KaraokeAppComponent
              standalone
              isWindowOpen={karaokeInstance.isOpen}
              isForeground
              onClose={() => {}}
              helpItems={appMeta?.helpItems}
              skipInitialSound
              initialData={karaokeInstance.initialData as KaraokeInitialData}
              instanceId={karaokeInstance.instanceId}
            />
          </AppErrorBoundary>
        ) : (
          <div className="fixed inset-0 flex items-center justify-center bg-black text-sm text-white/70">
            {t("common.loading.openingSharedKaraokeTrack", "Opening Karaoke…")}
          </div>
        )}
      </DesktopErrorBoundary>
      <Toaster position="bottom-center" offset="16px" />
    </>
  );
}
