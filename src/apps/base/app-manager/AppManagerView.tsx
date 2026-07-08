import { lazy, memo, Suspense, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import { Desktop } from "@/components/layout/Desktop";
import { DesktopCornerMask } from "@/components/layout/desktop/DesktopCornerMask";
import { Dock } from "@/components/layout/Dock";
import { ExposeView } from "@/components/layout/ExposeView";
import { getAppComponent } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistry";
import { requestCloseWindow } from "@/utils/windowUtils";
import { SpotlightSearch } from "@/components/layout/SpotlightSearch";
import { AppSwitcher } from "@/components/layout/AppSwitcher";
import { useAssistantStore } from "@/stores/useAssistantStore";
import { AppErrorBoundary } from "@/components/errors/ErrorBoundaries";
import { DialogParentWindowContext } from "@/components/shared/DialogParentWindowContext";
import { getTranslatedAppName } from "@/utils/i18n";
import { isTextEditInitialData } from "@/types/appInitialData";
import {
  selectIsInstanceForeground,
  useAppStore,
  useAppStoreShallow,
} from "@/stores/useAppStore";
import { shouldMountInstance } from "../instanceMountPolicy";
import {
  selectZIndexForInstance,
  supportsMultiWindowApp,
} from "./instanceHelpers";
import type { AppProps } from "../types";
import type { AppManagerViewModel } from "./useAppManager";
import { createClientLogger } from "@/utils/logger";

const appManagerViewLog = createClientLogger("AppManagerView");

// Code-split: the assistant overlay pulls the AI chat pipeline and the full
// client-side tool dispatcher, so it must never be statically reachable from
// the boot bundle. It only loads once the user has summoned the assistant.
const AssistantOverlay = lazy(() =>
  import("@/components/assistant/AssistantOverlay").then((m) => ({
    default: m.AssistantOverlay,
  }))
);

export function AppManagerView({
  apps,
  openInstanceIds,
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
  const assistantEnabled = useAssistantStore((state) => state.enabled);
  return (
    <>
      {showDesktopMenuBar && <MenuBar />}
      <Dock />
      {openInstanceIds.map((instanceId) => (
        <ManagedAppInstance
          key={instanceId}
          apps={apps}
          instanceId={instanceId}
          exposeMode={exposeMode}
          isInitialMount={isInitialMount}
          setCrashedInstanceIds={setCrashedInstanceIds}
          bringInstanceToForeground={bringInstanceToForeground}
          closeAppInstance={closeAppInstance}
          launchApp={launchApp}
          navigateToNextInstance={navigateToNextInstance}
          navigateToPreviousInstance={navigateToPreviousInstance}
        />
      ))}

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
      {assistantEnabled && (
        <Suspense fallback={null}>
          <AssistantOverlay />
        </Suspense>
      )}
      <DesktopCornerMask />
    </>
  );
}

const ManagedAppInstance = memo(function ManagedAppInstance({
  apps,
  instanceId,
  exposeMode,
  isInitialMount,
  setCrashedInstanceIds,
  bringInstanceToForeground,
  closeAppInstance,
  launchApp,
  navigateToNextInstance,
  navigateToPreviousInstance,
}: Pick<
  AppManagerViewModel,
  | "apps"
  | "exposeMode"
  | "isInitialMount"
  | "setCrashedInstanceIds"
  | "bringInstanceToForeground"
  | "closeAppInstance"
  | "launchApp"
  | "navigateToNextInstance"
  | "navigateToPreviousInstance"
> & {
  instanceId: string;
}) {
  const instance = useAppStoreShallow((state) => {
    const inst = state.instances[instanceId];
    if (!inst) return null;
    return {
      appId: inst.appId,
      createdAt: inst.createdAt,
      initialData: inst.initialData,
      instanceId: inst.instanceId,
      isLoading: inst.isLoading,
      isOpen: inst.isOpen,
      title: inst.title,
    };
  });
  const isForeground = useAppStore((state) =>
    selectIsInstanceForeground(state, instanceId)
  );
  // Scalar index — not the instanceOrder array — so windows whose stack
  // position is unchanged skip this commit when another window is focused.
  const zIndex = useAppStore((state) =>
    selectZIndexForInstance(state, instanceId)
  );

  // Hooks must run unconditionally — keep them above the early returns below
  // (react-hooks/rules-of-hooks; a conditional hook crashes React with a
  // hook-count mismatch when `isOpen`/`exposeMode` flips while mounted).
  const handleClose = useCallback(() => {
    requestCloseWindow(instanceId);
  }, [instanceId]);

  const handleNavigateNext = useCallback(() => {
    navigateToNextInstance(instanceId);
  }, [instanceId, navigateToNextInstance]);

  const handleNavigatePrevious = useCallback(() => {
    navigateToPreviousInstance(instanceId);
  }, [instanceId, navigateToPreviousInstance]);

  useEffect(() => {
    appManagerViewLog.debug("Managed app instance state changed", {
      instanceId,
      appId: instance?.appId,
      isOpen: !!instance?.isOpen,
      isLoading: !!instance?.isLoading,
      isForeground,
      exposeMode,
      zIndex,
    });
  }, [
    exposeMode,
    instance?.appId,
    instance?.isLoading,
    instance?.isOpen,
    instanceId,
    isForeground,
    zIndex,
  ]);

  if (!instance?.isOpen) return null;
  if (exposeMode && instance.appId === "stickies") return null;

  const appId = instance.appId as AppId;
  const AppComponent = getAppComponent(appId) as ComponentType<AppProps>;
  const app = apps.find((registeredApp) => registeredApp.id === appId);
  const translatedAppName = getTranslatedAppName(appId);
  const crashDialogAppName =
    translatedAppName !== appId ? translatedAppName : (app?.name ?? appId);

  const shouldMount = shouldMountInstance(instance, exposeMode);
  const hideWindow = !shouldMount || instance.isLoading;
  const effectiveIsForeground = exposeMode ? false : isForeground;

  return (
    <div
      style={{
        zIndex: exposeMode ? 9999 : zIndex,
        visibility: hideWindow ? "hidden" : "visible",
      }}
      className="absolute inset-x-0 md:inset-x-auto w-full md:w-auto"
      role="presentation"
      onMouseDown={() => {
        if (!isForeground && !exposeMode) {
          bringInstanceToForeground(instance.instanceId);
        }
      }}
      onTouchStart={() => {
        if (!isForeground && !exposeMode) {
          bringInstanceToForeground(instance.instanceId);
        }
      }}
    >
      <AppErrorBoundary
        appId={appId}
        appName={crashDialogAppName}
        instanceId={instance.instanceId}
        onCrash={() => {
          appManagerViewLog.debug("App instance crashed", {
            appId,
            instanceId: instance.instanceId,
          });
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
          appManagerViewLog.debug("Quitting crashed app instance", {
            appId,
            instanceId: instance.instanceId,
          });
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
          appManagerViewLog.debug("Relaunching crashed app instance", {
            appId,
            instanceId: instance.instanceId,
            hasInitialData: instance.initialData !== undefined,
          });
          setCrashedInstanceIds((prev) => {
            if (!prev.has(instance.instanceId)) {
              return prev;
            }
            const next = new Set(prev);
            next.delete(instance.instanceId);
            return next;
          });
          const relaunchInitialData =
            appId === "textedit" && isTextEditInitialData(instance.initialData)
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
          <DialogParentWindowContext.Provider value={instance.instanceId}>
            <ManagedAppRoot
              AppComponent={AppComponent}
              isWindowOpen={instance.isOpen}
              isForeground={effectiveIsForeground}
              onClose={handleClose}
              className="pointer-events-auto"
              helpItems={app?.helpItems}
              skipInitialSound={isInitialMount}
              initialData={instance.initialData}
              instanceId={instance.instanceId}
              title={instance.title}
              onNavigateNext={handleNavigateNext}
              onNavigatePrevious={handleNavigatePrevious}
            />
          </DialogParentWindowContext.Provider>
        ) : null}
      </AppErrorBoundary>
    </div>
  );
});

type ManagedAppRootProps = {
  AppComponent: ComponentType<AppProps>;
} & AppProps;

const ManagedAppRoot = memo(function ManagedAppRoot({
  AppComponent,
  ...props
}: ManagedAppRootProps) {
  return <AppComponent {...props} />;
});
