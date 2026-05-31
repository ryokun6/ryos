import { MenuBar } from "@/components/layout/MenuBar";
import { Desktop } from "@/components/layout/Desktop";
import { Dock } from "@/components/layout/Dock";
import { ExposeView } from "@/components/layout/ExposeView";
import { getAppComponent } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistry";
import { requestCloseWindow } from "@/utils/windowUtils";
import { SpotlightSearch } from "@/components/layout/SpotlightSearch";
import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { AppErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { getTranslatedAppName } from "@/utils/i18n";
import { isTextEditInitialData } from "@/types/appInitialData";
import { shouldMountInstance } from "../instanceMountPolicy";
import { getZIndexForInstance, supportsMultiWindowApp } from "./instanceHelpers";
import type { AppManagerViewModel } from "./useAppManager";

export function AppManagerView({
  apps,
  instances,
  instanceOrder,
  exposeMode,
  showDesktopMenuBar,
  isInitialMount,
  isExposeViewOpen,
  setIsExposeViewOpen,
  switcherVisible,
  switcherApps,
  switcherIndex,
  setCrashedInstanceIds,
  bringInstanceToForeground,
  closeAppInstance,
  launchApp,
  navigateToNextInstance,
  navigateToPreviousInstance,
}: AppManagerViewModel) {
  return (
    <>
      {showDesktopMenuBar && <MenuBar />}
      <Dock />
      {Object.values(instances).map((instance) => {
        if (!instance.isOpen) return null;
        if (exposeMode && instance.appId === "stickies") return null;

        const appId = instance.appId as AppId;
        const zIndex = getZIndexForInstance(
          instance.instanceId,
          instanceOrder
        );
        const AppComponent = getAppComponent(appId);
        const app = apps.find((registeredApp) => registeredApp.id === appId);
        const translatedAppName = getTranslatedAppName(appId);
        const crashDialogAppName =
          translatedAppName !== appId
            ? translatedAppName
            : (app?.name ?? appId);

        const shouldMount = shouldMountInstance(instance, exposeMode);
        const hideWindow = !shouldMount || instance.isLoading;

        return (
          <div
            key={instance.instanceId}
            style={{
              zIndex: exposeMode ? 9999 : zIndex,
              visibility: hideWindow ? "hidden" : "visible",
            }}
            className="absolute inset-x-0 md:inset-x-auto w-full md:w-auto"
            role="presentation"
            onMouseDown={() => {
              if (!instance.isForeground && !exposeMode) {
                bringInstanceToForeground(instance.instanceId);
              }
            }}
            onTouchStart={() => {
              if (!instance.isForeground && !exposeMode) {
                bringInstanceToForeground(instance.instanceId);
              }
            }}
          >
            <AppErrorBoundary
              appId={appId}
              appName={crashDialogAppName}
              instanceId={instance.instanceId}
              onCrash={() => {
                setCrashedInstanceIds((prev) => {
                  if (prev.has(instance.instanceId)) {
                    return prev;
                  }
                  const next = new Set(prev);
                  next.add(instance.instanceId);
                  return next;
                });
                bringInstanceToForeground(instance.instanceId);
              }}
              onQuit={() => {
                setCrashedInstanceIds((prev) => {
                  if (!prev.has(instance.instanceId)) {
                    return prev;
                  }
                  const next = new Set(prev);
                  next.delete(instance.instanceId);
                  return next;
                });
                closeAppInstance(instance.instanceId);
              }}
              onRelaunch={() => {
                setCrashedInstanceIds((prev) => {
                  if (!prev.has(instance.instanceId)) {
                    return prev;
                  }
                  const next = new Set(prev);
                  next.delete(instance.instanceId);
                  return next;
                });
                const relaunchInitialData =
                  appId === "textedit" &&
                  isTextEditInitialData(instance.initialData)
                    ? { path: instance.initialData.path }
                    : instance.initialData;

                closeAppInstance(instance.instanceId);
                launchApp(
                  appId,
                  relaunchInitialData,
                  instance.title,
                  supportsMultiWindowApp(appId)
                );
              }}
            >
              {shouldMount ? (
                <AppComponent
                  isWindowOpen={instance.isOpen}
                  isForeground={exposeMode ? false : instance.isForeground}
                  onClose={() => requestCloseWindow(instance.instanceId)}
                  className="pointer-events-auto"
                  helpItems={app?.helpItems}
                  skipInitialSound={isInitialMount}
                  // @ts-expect-error - Dynamic component system with different initialData types per app
                  initialData={instance.initialData}
                  instanceId={instance.instanceId}
                  title={instance.title}
                  onNavigateNext={() =>
                    navigateToNextInstance(instance.instanceId)
                  }
                  onNavigatePrevious={() =>
                    navigateToPreviousInstance(instance.instanceId)
                  }
                />
              ) : null}
            </AppErrorBoundary>
          </div>
        );
      })}

      <Desktop
        apps={apps}
        toggleApp={(appId, initialData, launchOrigin) => {
          launchApp(appId, initialData, undefined, false, launchOrigin);
        }}
      />

      <SpotlightSearch />

      <ExposeView
        isOpen={isExposeViewOpen}
        onClose={() => setIsExposeViewOpen(false)}
      />

      <AppSwitcher
        isVisible={switcherVisible}
        apps={switcherApps}
        selectedIndex={switcherIndex}
      />
    </>
  );
}
