import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppId } from "@/config/appRegistry";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { SwitcherApp } from "@/components/layout/AppSwitcher";
import {
  emitAppUpdate,
  onAppLaunchRequest,
  requestAppLaunch,
  toggleSpotlightSearch,
} from "@/utils/appEventBus";
import { useDashboardShellTriggers } from "@/hooks/useDashboardShellTriggers";
import {
  prefetchAppChunk,
  prefetchLikelyAppChunks,
} from "@/config/lazyAppComponent";
import { useAppStore } from "@/stores/useAppStore";
import { useGlobalUndoRedo } from "@/hooks/useGlobalUndoRedo";
import { createClientLogger } from "@/utils/logger";
import { resolveInitialRoute } from "../appRouteRegistry";
import { switcherInitialState } from "./constants";
import { switcherReducer } from "./switcherReducer";
import type { AppManagerProps } from "./types";
import { useAppManagerKeyboardShortcuts } from "./useAppManagerKeyboardShortcuts";

const appManagerLog = createClientLogger("AppManager");

export function useAppManager({ apps }: AppManagerProps) {
  const { t } = useTranslation();

  const {
    openInstanceIdsKey,
    launchApp,
    bringInstanceToForeground,
    closeAppInstance,
    navigateToNextInstance,
    navigateToPreviousInstance,
    minimizeInstance,
    restoreInstance,
    foregroundInstanceId,
    exposeMode,
  } = useAppStoreShallow((state) => ({
    openInstanceIdsKey: Object.values(state.instances)
      .filter((instance) => instance.isOpen)
      .map((instance) => instance.instanceId)
      .join("\0"),
    launchApp: state.launchApp,
    bringInstanceToForeground: state.bringInstanceToForeground,
    closeAppInstance: state.closeAppInstance,
    navigateToNextInstance: state.navigateToNextInstance,
    navigateToPreviousInstance: state.navigateToPreviousInstance,
    minimizeInstance: state.minimizeInstance,
    restoreInstance: state.restoreInstance,
    foregroundInstanceId: state.foregroundInstanceId,
    exposeMode: state.exposeMode,
  }));

  const openInstanceIds = useMemo(
    () => (openInstanceIdsKey ? openInstanceIdsKey.split("\0") : []),
    [openInstanceIdsKey]
  );

  const { isWindowsTheme } = useThemeFlags();

  const [crashedInstanceIds, setCrashedInstanceIds] = useState<Set<string>>(
    () => new Set()
  );

  const hasForegroundApp = !!foregroundInstanceId;
  const isForegroundAppCrashed = foregroundInstanceId
    ? crashedInstanceIds.has(foregroundInstanceId)
    : false;
  const showDesktopMenuBar =
    isWindowsTheme || !hasForegroundApp || exposeMode || isForegroundAppCrashed;

  const [isInitialMount, setIsInitialMount] = useState(true);
  const [isExposeViewOpen, setIsExposeViewOpen] = useState(false);

  useGlobalUndoRedo();

  const [switcherState, dispatchSwitcher] = useReducer(
    switcherReducer,
    switcherInitialState
  );
  const switcherVisible = switcherState.visible;
  const switcherApps = switcherState.apps;
  const switcherIndex = switcherState.index;

  const instancesRef = useRef(useAppStore.getState().instances);
  const instanceOrderRef = useRef(useAppStore.getState().instanceOrder);
  const launchAppRef = useRef(launchApp);
  const foregroundInstanceIdRef = useRef(foregroundInstanceId);
  const minimizeInstanceRef = useRef(minimizeInstance);
  const restoreInstanceRef = useRef(restoreInstance);
  const bringInstanceToForegroundRef = useRef(bringInstanceToForeground);
  const navigateToNextInstanceRef = useRef(navigateToNextInstance);
  const navigateToPreviousInstanceRef = useRef(navigateToPreviousInstance);
  const switcherVisibleRef = useRef(false);
  const switcherAppsRef = useRef<SwitcherApp[]>([]);
  const switcherIndexRef = useRef(0);

  useEffect(() => {
    instancesRef.current = useAppStore.getState().instances;
    return useAppStore.subscribe((state) => {
      instancesRef.current = state.instances;
    });
  }, []);

  useEffect(() => {
    instanceOrderRef.current = useAppStore.getState().instanceOrder;
    return useAppStore.subscribe((state) => {
      instanceOrderRef.current = state.instanceOrder;
    });
  }, []);

  useEffect(() => {
    launchAppRef.current = launchApp;
  }, [launchApp]);

  useEffect(() => {
    foregroundInstanceIdRef.current = foregroundInstanceId;
  }, [foregroundInstanceId]);

  useEffect(() => {
    minimizeInstanceRef.current = minimizeInstance;
  }, [minimizeInstance]);

  useEffect(() => {
    restoreInstanceRef.current = restoreInstance;
  }, [restoreInstance]);

  useEffect(() => {
    bringInstanceToForegroundRef.current = bringInstanceToForeground;
  }, [bringInstanceToForeground]);

  useEffect(() => {
    navigateToNextInstanceRef.current = navigateToNextInstance;
  }, [navigateToNextInstance]);

  useEffect(() => {
    navigateToPreviousInstanceRef.current = navigateToPreviousInstance;
  }, [navigateToPreviousInstance]);

  useEffect(() => {
    setCrashedInstanceIds((prev) => {
      if (prev.size === 0) {
        return prev;
      }

      let changed = false;
      const next = new Set<string>();
      const openIds = new Set(openInstanceIds);
      prev.forEach((instanceId) => {
        if (openIds.has(instanceId)) {
          next.add(instanceId);
        } else {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [openInstanceIds]);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitialMount(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    appManagerLog.debug("Window manager state changed", {
      openInstanceCount: openInstanceIds.length,
      foregroundInstanceId,
      exposeMode,
      showDesktopMenuBar,
      crashedInstanceCount: crashedInstanceIds.size,
    });
  }, [
    crashedInstanceIds.size,
    exposeMode,
    foregroundInstanceId,
    openInstanceIds.length,
    showDesktopMenuBar,
  ]);

  useEffect(() => {
    const routeAction = resolveInitialRoute(
      window.location.pathname,
      window.location.search
    );

    if (!routeAction) {
      appManagerLog.debug("No initial route action", {
        pathname: window.location.pathname,
      });
      return;
    }

    const resetUrl = () => {
      window.history.replaceState({}, "", "/");
    };

    if (routeAction.kind === "cleanup") {
      appManagerLog.debug("Cleaning up initial route", {
        pathname: window.location.pathname,
      });
      resetUrl();
      return;
    }

    appManagerLog.debug("Scheduling initial route launch", {
      appId: routeAction.request.appId,
      initialPath: routeAction.request.initialPath,
      hasInitialData: routeAction.request.initialData !== undefined,
      delayMs: routeAction.delayMs,
      urlCleanupTiming: routeAction.urlCleanupTiming,
    });
    prefetchAppChunk(routeAction.request.appId);

    if (routeAction.toast) {
      const message =
        routeAction.toast.type === "translation"
          ? t(routeAction.toast.message)
          : routeAction.toast.message;
      toast.info(message);
    }

    const timer = window.setTimeout(() => {
      appManagerLog.debug("Dispatching initial route launch", {
        appId: routeAction.request.appId,
        hasInitialData: routeAction.request.initialData !== undefined,
      });
      requestAppLaunch(routeAction.request);

      if (routeAction.urlCleanupTiming === "after-dispatch") {
        resetUrl();
      }
    }, routeAction.delayMs);

    if (routeAction.urlCleanupTiming === "immediate") {
      resetUrl();
    }

    return () => {
      window.clearTimeout(timer);
    };
  }, [t]);

  useEffect(() => {
    const run = () => {
      const recent = useAppStore.getState().recentApps;
      appManagerLog.debug("Prefetching likely app chunks", {
        recentApps: recent.map((r) => r.appId),
      });
      prefetchLikelyAppChunks(recent.map((r) => r.appId));
    };

    const win = globalThis as typeof globalThis & {
      requestIdleCallback?: typeof requestIdleCallback;
      cancelIdleCallback?: typeof cancelIdleCallback;
    };

    if (typeof win.requestIdleCallback === "function") {
      const idleHandle = win.requestIdleCallback(run, { timeout: 4500 });
      return () => {
        if (typeof win.cancelIdleCallback === "function") {
          win.cancelIdleCallback(idleHandle);
        }
      };
    }

    const timeoutHandle = globalThis.setTimeout(run, 2500);
    return () => globalThis.clearTimeout(timeoutHandle);
  }, []);

  useEffect(() => {
    const handleAppLaunch = (
      event: CustomEvent<{
        appId: AppId;
        initialPath?: string;
        initialData?: unknown;
      }>
    ) => {
      const { appId, initialPath, initialData } = event.detail;
      appManagerLog.debug("Received app launch request", {
        appId,
        initialPath,
        hasInitialData: initialData !== undefined,
      });

      const existingInstance = Object.values(instancesRef.current).find(
        (instance) => instance.appId === appId && instance.isOpen
      );

      const instanceId = launchAppRef.current(appId, initialData);
      appManagerLog.debug("Launch request resolved", {
        appId,
        instanceId,
        reusedExistingInstance: existingInstance?.instanceId === instanceId,
      });

      if (initialPath) {
        localStorage.setItem(`ryos:app:${appId}:initial-path`, initialPath);
        appManagerLog.debug("Stored app initial path", {
          appId,
          initialPath,
        });
      }

      if (
        existingInstance &&
        initialData &&
        instanceId === existingInstance.instanceId
      ) {
        appManagerLog.debug("Emitting app update for existing instance", {
          appId,
          instanceId,
        });
        emitAppUpdate({ appId, instanceId, initialData });
      }
    };

    return onAppLaunchRequest(handleAppLaunch);
  }, []);

  const toggleDashboard = useCallback(() => {
    const insts = instancesRef.current;
    const dashboardInstance = Object.values(insts).find(
      (inst) => inst.appId === "dashboard" && inst.isOpen
    );
    if (dashboardInstance) {
      appManagerLog.debug("Closing dashboard from shell toggle", {
        instanceId: dashboardInstance.instanceId,
      });
      closeAppInstance(dashboardInstance.instanceId);
    } else {
      appManagerLog.debug("Opening dashboard from shell toggle");
      launchAppRef.current("dashboard");
    }
  }, [closeAppInstance]);

  const closeDashboardIfOpen = useCallback(() => {
    const insts = instancesRef.current;
    const dashboardInstance = Object.values(insts).find(
      (inst) => inst.appId === "dashboard" && inst.isOpen
    );
    if (dashboardInstance) {
      appManagerLog.debug("Closing dashboard overlay", {
        instanceId: dashboardInstance.instanceId,
      });
      closeAppInstance(dashboardInstance.instanceId);
    }
  }, [closeAppInstance]);

  const closeOverlaysForSpotlight = useCallback(() => {
    setIsExposeViewOpen(false);
    closeDashboardIfOpen();
  }, [closeDashboardIfOpen]);

  useDashboardShellTriggers({
    closeDashboardIfOpen,
    toggleExposeFromKeyboard: () => {
      setIsExposeViewOpen((prev) => !prev);
    },
    toggleExposeFromEvent: () => {
      setIsExposeViewOpen((prev) => !prev);
    },
    toggleDashboardFromKeyboard: () => {
      setIsExposeViewOpen(false);
      toggleDashboard();
    },
    toggleSpotlightFromKeyboard: () => {
      setIsExposeViewOpen(false);
      closeDashboardIfOpen();
      toggleSpotlightSearch();
    },
    closeOverlaysForSpotlightEvent: closeOverlaysForSpotlight,
  });

  useAppManagerKeyboardShortcuts(
    {
      instancesRef,
      instanceOrderRef,
      foregroundInstanceIdRef,
      minimizeInstanceRef,
      restoreInstanceRef,
      bringInstanceToForegroundRef,
      navigateToNextInstanceRef,
      navigateToPreviousInstanceRef,
      switcherVisibleRef,
      switcherAppsRef,
      switcherIndexRef,
    },
    dispatchSwitcher
  );

  return {
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
    crashedInstanceIds,
    setCrashedInstanceIds,
    bringInstanceToForeground,
    closeAppInstance,
    launchApp,
    navigateToNextInstance,
    navigateToPreviousInstance,
  };
}

export type AppManagerViewModel = ReturnType<typeof useAppManager>;
