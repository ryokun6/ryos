import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/sonner";
import { AppErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { DesktopErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { IpodAppComponent } from "@/apps/ipod/components/IpodAppComponent";
import { appRegistry } from "@/config/appRegistry";
import { useAppStoreShallow } from "@/stores/helpers";
import { useOffline } from "@/hooks/useOffline";
import { applyDisplayMode } from "@/utils/displayMode";
import { useDisplaySettingsStoreShallow } from "@/stores/helpers";
import { getTranslatedAppName } from "@/utils/i18n";
import { parseStandaloneIpodRoute } from "@/utils/standaloneIpodRoute";
import type { IpodInitialData } from "@/apps/base/types";

const IPOD_APP_ID = "ipod" as const;

export function StandaloneIpodApp() {
  const { t } = useTranslation();
  const displayMode = useDisplaySettingsStoreShallow((state) => state.displayMode);
  useOffline();

  const routeInitialData = useMemo(
    () =>
      parseStandaloneIpodRoute(
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
    document.documentElement.dataset.standaloneIpod = "true";
    document.title = "iPod · ryOS";
    return () => {
      delete document.documentElement.dataset.standaloneIpod;
    };
  }, []);

  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    launchApp(IPOD_APP_ID, routeInitialData as IpodInitialData);
  }, [launchApp, routeInitialData]);

  const ipodInstance = Object.values(instances).find(
    (instance) => instance.appId === IPOD_APP_ID && instance.isOpen
  );

  const appMeta = appRegistry[IPOD_APP_ID];
  const translatedAppName = getTranslatedAppName(IPOD_APP_ID);
  const crashDialogAppName =
    translatedAppName !== IPOD_APP_ID ? translatedAppName : (appMeta?.name ?? IPOD_APP_ID);

  return (
    <>
      <DesktopErrorBoundary>
        {ipodInstance ? (
          <AppErrorBoundary
            appId={IPOD_APP_ID}
            appName={crashDialogAppName}
            instanceId={ipodInstance.instanceId}
            onQuit={() => {
              window.location.href = "/";
            }}
            onRelaunch={() => {
              launchApp(IPOD_APP_ID, routeInitialData as IpodInitialData);
            }}
          >
            <IpodAppComponent
              standalone
              isWindowOpen={ipodInstance.isOpen}
              isForeground
              onClose={() => {}}
              helpItems={appMeta?.helpItems}
              skipInitialSound
              initialData={ipodInstance.initialData as IpodInitialData}
              instanceId={ipodInstance.instanceId}
            />
          </AppErrorBoundary>
        ) : (
          <div className="fixed inset-0 flex items-center justify-center bg-[#1a1a1a] text-sm text-white/70">
            {t("common.loading.openingSharedIpodTrack", "Opening iPod…")}
          </div>
        )}
      </DesktopErrorBoundary>
      <Toaster position="bottom-center" offset="16px" />
    </>
  );
}
