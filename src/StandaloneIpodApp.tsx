import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/sonner";
import { AppErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { DesktopErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { IpodAppComponent } from "@/apps/ipod/components/IpodAppComponent";
import { getWindowConfig, appRegistry } from "@/config/appRegistry";
import { useAppStoreShallow } from "@/stores/helpers";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useIsMobile } from "@/hooks/useIsMobile";
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
  const { isWindowsTheme, isMacOSTheme, isSystem7Theme } = useThemeFlags();
  const isMobile = useIsMobile();
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
  const instanceIdRef = useRef<string | null>(null);

  const { instances, launchApp, updateInstanceWindowState } =
    useAppStoreShallow((state) => ({
      instances: state.instances,
      launchApp: state.launchApp,
      updateInstanceWindowState: state.updateInstanceWindowState,
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

    const id = launchApp(IPOD_APP_ID, routeInitialData as IpodInitialData);
    instanceIdRef.current = id;

    const config = getWindowConfig(IPOD_APP_ID);
    const width = config.defaultSize.width;
    const height = config.defaultSize.height;
    const position = {
      x: Math.max(0, Math.round((window.innerWidth - width) / 2)),
      y: Math.max(0, Math.round((window.innerHeight - height) / 2)),
    };
    updateInstanceWindowState(id, position, { width, height });

    const onResize = () => {
      updateInstanceWindowState(
        id,
        {
          x: Math.max(0, Math.round((window.innerWidth - width) / 2)),
          y: Math.max(0, Math.round((window.innerHeight - height) / 2)),
        },
        { width, height }
      );
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [launchApp, routeInitialData, updateInstanceWindowState]);

  const ipodInstance = Object.values(instances).find(
    (instance) => instance.appId === IPOD_APP_ID && instance.isOpen
  );

  const toastConfig = useMemo(() => {
    const dockHeight = isMacOSTheme ? 56 : 0;
    const taskbarHeight = isWindowsTheme ? 30 : 0;

    if (isMobile) {
      const bottomOffset = dockHeight + taskbarHeight + 16;
      return {
        position: "bottom-center" as const,
        offset: `calc(env(safe-area-inset-bottom, 0px) + ${bottomOffset}px)`,
      };
    }

    if (isWindowsTheme) {
      return {
        position: "bottom-right" as const,
        offset: `calc(env(safe-area-inset-bottom, 0px) + 42px)`,
      };
    }

    const menuBarHeight = isSystem7Theme ? 30 : 25;
    return {
      position: "top-right" as const,
      offset: `${menuBarHeight + 12}px`,
    };
  }, [isWindowsTheme, isMacOSTheme, isSystem7Theme, isMobile]);

  const appMeta = appRegistry[IPOD_APP_ID];
  const translatedAppName = getTranslatedAppName(IPOD_APP_ID);
  const crashDialogAppName =
    translatedAppName !== IPOD_APP_ID ? translatedAppName : (appMeta?.name ?? IPOD_APP_ID);

  const exitToDesktop = () => {
    window.location.href = "/";
  };

  return (
    <>
      <DesktopErrorBoundary>
        <div
          className="standalone-ipod-root fixed inset-0 overflow-hidden bg-[#1a1a1a]"
          data-standalone-ipod
        >
          {ipodInstance ? (
            <div className="absolute inset-0" role="presentation">
              <AppErrorBoundary
                appId={IPOD_APP_ID}
                appName={crashDialogAppName}
                instanceId={ipodInstance.instanceId}
                onQuit={exitToDesktop}
                onRelaunch={() => {
                  launchApp(IPOD_APP_ID, routeInitialData as IpodInitialData);
                }}
              >
                <IpodAppComponent
                  isWindowOpen={ipodInstance.isOpen}
                  isForeground
                  onClose={exitToDesktop}
                  className="pointer-events-auto"
                  helpItems={appMeta?.helpItems}
                  skipInitialSound
                  initialData={ipodInstance.initialData as IpodInitialData}
                  instanceId={ipodInstance.instanceId}
                />
              </AppErrorBoundary>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-white/70">
              {t("common.loading.openingSharedIpodTrack", "Opening iPod…")}
            </div>
          )}
        </div>
      </DesktopErrorBoundary>
      <Toaster position={toastConfig.position} offset={toastConfig.offset} />
    </>
  );
}
