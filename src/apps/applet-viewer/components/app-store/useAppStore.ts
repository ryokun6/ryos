import { useState, useEffect, useRef, useMemo, useCallback, useReducer } from "react";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useAppletActions, type Applet } from "../../utils/appletActions";
import type { AppStoreFeedRef } from "../AppStoreFeed";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type { AppStoreProps } from "./types";
import { appStoreReducer, initialState } from "./reducer";

export type AppStoreViewModel = ReturnType<typeof useAppStore>;

export function useAppStore({ theme, sharedAppletId, focusWindow }: AppStoreProps) {
  const { t } = useTranslation();
  const [applets, setApplets] = useState<Applet[]>([]);
  const [state, dispatch] = useReducer(appStoreReducer, initialState);
  const {
    isLoading,
    searchQuery,
    selectedApplet,
    selectedAppletContent,
    isSharedApplet,
    showListView,
    isBulkUpdating,
  } = state;
  const setIsLoading = useCallback((value: boolean) => {
    dispatch({ type: "setLoading", value });
  }, []);
  const setSearchQuery = useCallback((value: string) => {
    dispatch({ type: "setSearchQuery", value });
  }, []);
  const setSelectedApplet = useCallback((value: Applet | null) => {
    dispatch({ type: "setSelectedApplet", value });
  }, []);
  const setSelectedAppletContent = useCallback((value: string) => {
    dispatch({ type: "setSelectedAppletContent", value });
  }, []);
  const setShowListView = useCallback((value: boolean) => {
    dispatch({ type: "setShowListView", value });
  }, []);
  const setIsBulkUpdating = useCallback((value: boolean) => {
    dispatch({ type: "setBulkUpdating", value });
  }, []);
  const feedRef = useRef<AppStoreFeedRef>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAdmin = useIsRyoAdmin() && !!isAuthenticated;
  const {
    isMacOSTheme: osIsMac,
    isSystem7Theme: osIsSystem7,
    isWindowsTheme,
  } = useThemeFlags();
  const isMacChrome = theme === "macosx" || osIsMac;
  const isSystem7Chrome = theme === "system7" || osIsSystem7;
  const isMacTheme = theme === "macosx";
  const isSystem7Theme = theme === "system7";

  const actions = useAppletActions();
  const lastUpdateToastKeyRef = useRef<string | null>(null);
  const updateToastIdRef = useRef<string | number | null>(null);

  const fetchApplets = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await abortableFetch(getApiUrl("/api/share-applet?list=true"), {
          signal,
          timeout: 15000,
          retry: { maxAttempts: 2, initialDelayMs: 500 },
        });
        if (signal?.aborted) return;

        const data = await response.json();
        if (signal?.aborted) return;

        const sortedApplets = (data.applets || []).sort((a: Applet, b: Applet) => {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        setApplets(sortedApplets);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Error fetching applets:", error);
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [setIsLoading]
  );

  const handleUpdateAll = async (updates: Applet[]) => {
    if (isBulkUpdating || updates.length === 0) {
      return;
    }

    setIsBulkUpdating(true);

    if (updateToastIdRef.current) {
      toast.dismiss(updateToastIdRef.current);
      updateToastIdRef.current = null;
    }

    const updateCount = updates.length;
    const loadingMessage =
      updateCount === 1
        ? t("apps.applet-viewer.dialogs.updatingAppletSingle")
        : t("apps.applet-viewer.dialogs.updatingAppletsPlural", { count: updateCount });
    const loadingToastId = toast.loading(loadingMessage, {
      duration: Infinity,
    });

    try {
      for (const applet of updates) {
        await actions.handleInstall(applet);
      }

      await fetchApplets();

      toast.success(
        updateCount === 1
          ? t("apps.applet-viewer.dialogs.appletUpdated")
          : t("apps.applet-viewer.dialogs.appletsUpdated", { count: updateCount }),
        {
          id: loadingToastId,
          duration: 3000,
        }
      );
      lastUpdateToastKeyRef.current = null;
    } catch (error) {
      console.error("Error updating applets:", error);
      toast.error(t("apps.applet-viewer.dialogs.failedToUpdateApplets"), {
        description:
          error instanceof Error
            ? error.message
            : t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
        id: loadingToastId,
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchApplets(controller.signal);
    return () => controller.abort();
  }, [fetchApplets]);

  useEffect(() => {
    if (isBulkUpdating) {
      return;
    }

    if (!applets.length) {
      lastUpdateToastKeyRef.current = null;
      if (updateToastIdRef.current) {
        toast.dismiss(updateToastIdRef.current);
        updateToastIdRef.current = null;
      }
      return;
    }

    const updates = applets.filter(
      (applet) => actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet)
    );

    if (updates.length === 0) {
      lastUpdateToastKeyRef.current = null;
      if (updateToastIdRef.current) {
        toast.dismiss(updateToastIdRef.current);
        updateToastIdRef.current = null;
      }
      return;
    }

    const toastKey = updates
      .map((applet) => applet.id)
      .sort()
      .join("|");

    if (toastKey === lastUpdateToastKeyRef.current) {
      return;
    }

    lastUpdateToastKeyRef.current = toastKey;

    const updateCount = updates.length;
    const appletNames = updates
      .map(
        (applet) =>
          applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet")
      )
      .join(", ");
    const toastId = toast.info(
      updateCount === 1
        ? t("apps.applet-viewer.dialogs.newAppletUpdates", { count: updateCount })
        : t("apps.applet-viewer.dialogs.newAppletUpdatesPlural", { count: updateCount }),
      {
        description: appletNames,
        action: {
          label: t("apps.applet-viewer.status.update"),
          onClick: () => handleUpdateAll(updates),
        },
        duration: 8000,
      }
    );

    updateToastIdRef.current = toastId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applets, isBulkUpdating, t]);

  useEffect(() => {
    if (sharedAppletId) {
      const controller = new AbortController();
      let isActive = true;
      const fetchSharedApplet = async () => {
        try {
          const response = await abortableFetch(
            getApiUrl(`/api/share-applet?id=${encodeURIComponent(sharedAppletId)}`),
            {
              signal: controller.signal,
              timeout: 15000,
              retry: { maxAttempts: 2, initialDelayMs: 500 },
            }
          );
          if (!isActive || controller.signal.aborted) return;

          const data = await response.json();
          if (!isActive || controller.signal.aborted) return;

          const applet: Applet = {
            id: sharedAppletId,
            title: data.title,
            name: data.name,
            icon: data.icon,
            createdAt: data.createdAt || Date.now(),
            createdBy: data.createdBy,
          };
          dispatch({
            type: "setSelectedAppletDetail",
            applet,
            content: data.content || "",
            isShared: true,
          });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          if (!isActive || controller.signal.aborted) return;
          console.error("Error fetching shared applet:", error);
          if (error instanceof Error && error.message.includes("404")) {
            toast.error(t("apps.applet-viewer.dialogs.appletNotFound"), {
              description: t("apps.applet-viewer.dialogs.appletNotFoundDescription"),
            });
          } else {
            toast.error(t("apps.applet-viewer.dialogs.failedToLoadSharedApplet"), {
              description: t("apps.applet-viewer.dialogs.pleaseCheckConnection"),
            });
          }
        }
      };
      void fetchSharedApplet();
      return () => {
        isActive = false;
        controller.abort();
      };
    }
  }, [sharedAppletId, t]);

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    const fetchSelectedAppletContent = async () => {
      if (selectedApplet) {
        if (isSharedApplet) {
          return;
        }
        if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
          setSelectedAppletContent("");
          return;
        }
        setSelectedAppletContent("");
        try {
          const response = await abortableFetch(
            getApiUrl(`/api/share-applet?id=${encodeURIComponent(selectedApplet.id)}`),
            {
              signal: controller.signal,
              timeout: 15000,
              retry: { maxAttempts: 2, initialDelayMs: 500 },
            }
          );
          if (!isActive || controller.signal.aborted) return;

          const data = await response.json();
          if (!isActive || controller.signal.aborted) return;

          setSelectedAppletContent(data.content || "");
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          if (!isActive || controller.signal.aborted) return;
          console.error("Error fetching applet content:", error);
          setSelectedAppletContent("");
        }
      } else {
        setSelectedAppletContent("");
      }
    };

    void fetchSelectedAppletContent();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [selectedApplet, isSharedApplet, setSelectedAppletContent]);

  const handleAppletClick = async (applet: Applet) => {
    focusWindow?.();
    const result = await actions.handleAppletClick(applet);
    if (result) {
      setSelectedApplet(result);
    }
  };

  const handlePreviewClick = async (applet: Applet) => {
    focusWindow?.();
    const installed = actions.isAppletInstalled(applet.id);
    if (installed) {
      await handleAppletClick(applet);
    }
  };

  const handleInstall = async (applet: Applet) => {
    if (isBulkUpdating) return;
    focusWindow?.();
    await actions.handleInstall(applet, async () => {
      await fetchApplets();
      setSelectedApplet(null);
    });
  };

  const handleDelete = async (appletId: string) => {
    if (!isAdmin) return;

    if (!confirm(t("apps.applet-viewer.dialogs.areYouSureDeleteApplet"))) {
      return;
    }

    try {
      await abortableFetch(getApiUrl(`/api/share-applet?id=${encodeURIComponent(appletId)}`), {
        method: "DELETE",
        timeout: 15000,
        retry: { maxAttempts: 1 },
      });

      toast.success(t("apps.applet-viewer.dialogs.appletDeleted"));
      void fetchApplets();
    } catch (error) {
      console.error("Error deleting applet:", error);
      toast.error(t("apps.applet-viewer.dialogs.failedToDeleteApplet"), {
        description: t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
      });
    }
  };

  const handleToggleFeatured = async (appletId: string, currentFeatured: boolean) => {
    if (!isAdmin) return;

    try {
      await abortableFetch(getApiUrl(`/api/share-applet?id=${encodeURIComponent(appletId)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featured: !currentFeatured }),
        timeout: 15000,
        retry: { maxAttempts: 1 },
      });

      toast.success(
        currentFeatured
          ? t("apps.applet-viewer.dialogs.removedFromFeatured")
          : t("apps.applet-viewer.dialogs.addedToFeatured")
      );
      void fetchApplets();
    } catch (error) {
      console.error("Error updating featured status:", error);
      toast.error(t("apps.applet-viewer.dialogs.failedToUpdateFeaturedStatus"), {
        description: t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
      });
    }
  };

  const clearSelectedAppletDetail = useCallback(() => {
    dispatch({ type: "clearSelectedAppletDetail" });
  }, []);

  const filteredApplets = useMemo(() => {
    return applets.filter((applet) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const displayName = (
        applet.title ||
        applet.name ||
        t("apps.applet-viewer.dialogs.untitledApplet")
      ).toLowerCase();
      const createdBy = (applet.createdBy || "").toLowerCase();
      return displayName.includes(query) || createdBy.includes(query);
    });
  }, [applets, searchQuery, t]);

  const updatesAvailable = useMemo(
    () =>
      filteredApplets
        .filter((applet) => actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );
  const installedApplets = useMemo(
    () =>
      filteredApplets
        .filter(
          (applet) => actions.isAppletInstalled(applet.id) && !actions.needsUpdate(applet)
        )
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );
  const featuredApplets = useMemo(
    () =>
      filteredApplets
        .filter((applet) => applet.featured && !actions.isAppletInstalled(applet.id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );
  const allApplets = useMemo(
    () =>
      filteredApplets
        .filter((applet) => !applet.featured && !actions.isAppletInstalled(applet.id))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );

  return {
    t,
    theme,
    focusWindow,
    feedRef,
    isLoading,
    searchQuery,
    setSearchQuery,
    selectedApplet,
    selectedAppletContent,
    showListView,
    setShowListView,
    isBulkUpdating,
    isAdmin,
    isWindowsTheme,
    isMacChrome,
    isSystem7Chrome,
    isMacTheme,
    isSystem7Theme,
    actions,
    applets,
    filteredApplets,
    updatesAvailable,
    installedApplets,
    featuredApplets,
    allApplets,
    setSelectedApplet,
    clearSelectedAppletDetail,
    handleAppletClick,
    handlePreviewClick,
    handleInstall,
    handleDelete,
    handleToggleFeatured,
  };
}
