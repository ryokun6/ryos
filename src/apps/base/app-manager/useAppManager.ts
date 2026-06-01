import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppId } from "@/config/appRegistry";
import { useAppStoreShallow } from "@/stores/helpers";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { SwitcherApp } from "@/components/layout/AppSwitcher";
import {
  emitAppUpdate,
  onAppLaunchRequest,
  requestAppLaunch,
  toggleSpotlightSearch,
} from "@/utils/appEventBus";
import { useDashboardShellTriggers } from "@/hooks/useDashboardShellTriggers";
import { prefetchAppChunk, prefetchLikelyAppChunks } from "@/config/lazyAppComponent";
import { useAppStore } from "@/stores/useAppStore";
import { useGlobalUndoRedo } from "@/hooks/useGlobalUndoRedo";
import { resolveInitialRoute } from "../appRouteRegistry";
import { switcherInitialState } from "./constants";
import { switcherReducer } from "./switcherReducer";
import type { AppManagerProps } from "./types";
import { useAppManagerKeyboardShortcuts } from "./useAppManagerKeyboardShortcuts";

export function useAppManager({ apps }: AppManagerProps) {
  const { t } = useTranslation();

  const {
    openInstanceIds,
    instanceOrder,
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
    openInstanceIds: Object.values(state.instances)
      .filter((instance) => instance.isOpen)
      .map((instance) => instance.instanceId),
    instanceOrder: state.instanceOrder,
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

  const { isWindowsTheme: isXpTheme } = useThemeFlags();

  const [crashedInstanceIds, setCrashedInstanceIds] = useState<Set<string>>(
    () => new Set()
  );

  const hasForegroundApp = !!foregroundInstanceId;
  const isForegroundAppCrashed = foregroundInstanceId
    ? crashedInstanceIds.has(foregroundInstanceId)
    : false;
  const showDesktopMenuBar =
    isXpTheme || !hasForegroundApp || exposeMode || isForegroundAppCrashed;

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
  const instanceOrderRef = useRef(instanceOrder);
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
    instanceOrderRef.current = instanceOrder;
  }, [instanceOrder]);

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
    const routeAction = resolveInitialRoute(
      window.location.pathname,
      window.location.search
    );

    if (!routeAction) {
      return;
    }

    const resetUrl = () => {
      window.history.replaceState({}, "", "/");
    };

    if (routeAction.kind === "cleanup") {
      resetUrl();
      return;
    }

    prefetchAppChunk(routeAction.request.appId);

    if (routeAction.toast) {
      const message =
        routeAction.toast.type === "translation"
          ? t(routeAction.toast.message)
          : routeAction.toast.message;
      toast.info(message);
    }

    const timer = window.setTimeout(() => {
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

      const existingInstance = Object.values(instancesRef.current).find(
        (instance) => instance.appId === appId && instance.isOpen
      );

      const instanceId = launchAppRef.current(appId, initialData);

      if (initialPath) {
        localStorage.setItem(`ryos:app:${appId}:initial-path`, initialPath);
      }

      if (
        existingInstance &&
        initialData &&
        instanceId === existingInstance.instanceId
      ) {
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
      closeAppInstance(dashboardInstance.instanceId);
    } else {
      launchAppRef.current("dashboard");
    }
  }, [closeAppInstance]);

  const closeDashboardIfOpen = useCallback(() => {
    const insts = instancesRef.current;
    const dashboardInstance = Object.values(insts).find(
      (inst) => inst.appId === "dashboard" && inst.isOpen
    );
    if (dashboardInstance) {
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
    instanceOrder,
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
