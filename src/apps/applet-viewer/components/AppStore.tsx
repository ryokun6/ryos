import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useChatsStore } from "@/stores/useChatsStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { Trash, Star, ArrowLeft, Sparkle, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useAppletActions, type Applet } from "../utils/appletActions";
import { AppStoreFeed, type AppStoreFeedRef } from "./AppStoreFeed";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

interface AppStoreProps {
  theme?: string;
  sharedAppletId?: string; // ID of shared applet to show in detail view
  focusWindow?: () => void;
}

export function AppStore({ theme, sharedAppletId, focusWindow }: AppStoreProps) {
  const { t } = useTranslation();
  const [applets, setApplets] = useState<Applet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplet, setSelectedApplet] = useState<Applet | null>(null);
  const [selectedAppletContent, setSelectedAppletContent] = useState<string>("");
  const [isSharedApplet, setIsSharedApplet] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const feedRef = useRef<AppStoreFeedRef>(null);
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const isAdmin = username?.toLowerCase() === "ryo" && !!authToken;
  const isMacTheme = theme === "macosx";
  const isSystem7Theme = theme === "system7";
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  
  const actions = useAppletActions();
  const lastUpdateToastKeyRef = useRef<string | null>(null);
  const updateToastIdRef = useRef<string | number | null>(null);


  const fetchApplets = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await abortableFetch(
        getApiUrl("/api/share-applet?list=true"),
        {
          signal,
          timeout: 15000,
          retry: { maxAttempts: 2, initialDelayMs: 500 },
        }
      );
      if (signal?.aborted) return;

      const data = await response.json();
      if (signal?.aborted) return;

      // Sort by createdAt descending (latest first)
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
  }, []);

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
          error instanceof Error ? error.message : t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
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
      (applet) =>
        actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet)
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
        .map((applet) => applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet"))
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

  // If sharedAppletId is provided, fetch and show that applet in detail view
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
          setSelectedApplet(applet);
          setSelectedAppletContent(data.content || "");
          setIsSharedApplet(true);
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

  // Fetch applet content when selectedApplet changes (but skip if content already loaded from sharedAppletId)
  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    const fetchSelectedAppletContent = async () => {
      if (selectedApplet) {
      // If content is already set (from sharedAppletId fetch), don't fetch again
      if (selectedAppletContent && isSharedApplet) {
        return;
      }
      // Check if offline
      if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
        setSelectedAppletContent("");
        return;
      }
      // Reset content immediately to show loading
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
        // Keep content empty to show loading state indefinitely
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
  }, [selectedApplet, selectedAppletContent, isSharedApplet]);

  // Ensure macOSX theme uses Lucida Grande/system/emoji-safe fonts inside iframe content
  const ensureMacFonts = (content: string): string => {
    if (!isMacTheme || !content) return content;
    // Ensure fonts.css is available and prefer Lucida Grande
    const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
    const fontStyle = `<style data-ryos-applet-font-fix>
      html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
      *{font-family:inherit!important}
      h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    </style>`;

    // If there's a </head>, inject before it
    const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
    if (headCloseIdx !== -1) {
      return (
        content.slice(0, headCloseIdx) +
        preload +
        fontStyle +
        content.slice(headCloseIdx)
      );
    }

    // If there's a <body>, inject before it
    const bodyOpenIdx = content.toLowerCase().indexOf("<body");
    if (bodyOpenIdx !== -1) {
      const bodyTagEnd = content.indexOf(">", bodyOpenIdx) + 1;
      return (
        content.slice(0, bodyTagEnd) +
        preload +
        fontStyle +
        content.slice(bodyTagEnd)
      );
    }

    // Otherwise, prepend
    return preload + fontStyle + content;
  };

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
      // If installed, bring window to foreground
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
      await abortableFetch(
        getApiUrl(`/api/share-applet?id=${encodeURIComponent(appletId)}`),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "X-Username": username!,
          },
          timeout: 15000,
          retry: { maxAttempts: 1 },
        }
      );

      toast.success(t("apps.applet-viewer.dialogs.appletDeleted"));
      void fetchApplets(); // Refresh list
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
      await abortableFetch(
        getApiUrl(`/api/share-applet?id=${encodeURIComponent(appletId)}`),
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "X-Username": username!,
          },
          body: JSON.stringify({ featured: !currentFeatured }),
          timeout: 15000,
          retry: { maxAttempts: 1 },
        }
      );

      toast.success(currentFeatured ? t("apps.applet-viewer.dialogs.removedFromFeatured") : t("apps.applet-viewer.dialogs.addedToFeatured"));
      void fetchApplets(); // Refresh list
    } catch (error) {
      console.error("Error updating featured status:", error);
      toast.error(t("apps.applet-viewer.dialogs.failedToUpdateFeaturedStatus"), {
        description: t("apps.applet-viewer.dialogs.pleaseTryAgainLater"),
      });
    }
  };

  // IMPORTANT: All hooks must be called before any early returns
  // Filter applets based on search query - memoized to avoid recalculation
  const filteredApplets = useMemo(() => {
    return applets.filter((applet) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const displayName = (applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet")).toLowerCase();
      const createdBy = (applet.createdBy || "").toLowerCase();
      return displayName.includes(query) || createdBy.includes(query);
    });
  }, [applets, searchQuery, t]);

  // Separate into updates available, installed (no updates), featured (not installed), and all (not installed, not featured)
  // Sort each group by createdAt descending (latest first)
  // Memoize these calculations to avoid recalculating on every render
  const updatesAvailable = useMemo(() => 
    filteredApplets
      .filter((applet) => actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );
  const installedApplets = useMemo(() =>
    filteredApplets
      .filter((applet) => actions.isAppletInstalled(applet.id) && !actions.needsUpdate(applet))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );
  const featuredApplets = useMemo(() =>
    filteredApplets
      .filter((applet) => applet.featured && !actions.isAppletInstalled(applet.id))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );
  const allApplets = useMemo(() =>
    filteredApplets
      .filter((applet) => !applet.featured && !actions.isAppletInstalled(applet.id))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [filteredApplets, actions]
  );

  // Add CSS to ensure emoji size doesn't get overridden by theme styles
  const appletIconStyles = `
    .applet-icon {
      font-size: 2.25rem !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
  `;

  // Early returns - all hooks must be called before these
  if (isLoading) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">{t("apps.applet-viewer.dialogs.loading")}</p>
          </div>
        </div>
      </>
    );
  }

  // Format relative update time
  const formatUpdateTime = (timestamp: number): string => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const updateDate = new Date(timestamp);
    const today = new Date();
    const isToday =
      updateDate.getDate() === today.getDate() &&
      updateDate.getMonth() === today.getMonth() &&
      updateDate.getFullYear() === today.getFullYear();

    if (isToday) {
      if (diffMins < 1) return t("apps.applet-viewer.status.updatedJustNow");
      if (diffMins < 60) return t("apps.applet-viewer.status.updatedMinutesAgo", { minutes: diffMins });
      return t("apps.applet-viewer.status.updatedHoursAgo", { hours: diffHours });
    }

    if (diffDays === 1) return t("apps.applet-viewer.status.updatedYesterday");
    if (diffDays < 7) return t("apps.applet-viewer.status.updatedDaysAgo", { days: diffDays });
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return t("apps.applet-viewer.status.updatedWeeksAgo", { weeks });
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return t("apps.applet-viewer.status.updatedMonthsAgo", { months });
    }
    const years = Math.floor(diffDays / 365);
    return t("apps.applet-viewer.status.updatedYearsAgo", { years });
  };

    const renderAppletItem = (applet: Applet) => {
      const displayName = applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet");
      const displayIcon = applet.icon || "📱";
      const installed = actions.isAppletInstalled(applet.id);
      const updateAvailable = actions.needsUpdate(applet);

      return (
        <div
          key={applet.id}
          className={`group flex items-center gap-3 px-3 py-2 rounded transition-colors ${
            installed ? "cursor-pointer hover:bg-gray-100" : "cursor-pointer hover:bg-gray-100"
          }`}
          onClick={(e) => {
            // Don't trigger if clicking on buttons or admin actions
            const target = e.target as HTMLElement;
            if (target.closest("button") || target.closest('[role="button"]')) {
              return;
            }
            focusWindow?.();
            handleAppletClick(applet);
          }}
        >
          <div
            className="!text-4xl flex-shrink-0 applet-icon flex items-center justify-center"
            style={{ fontSize: "2.25rem", width: "3rem" }}
          >
            {displayIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm font-geneva-12 truncate">
                {displayName}
              </span>
            </div>
            {updateAvailable && applet.createdAt ? (
              <div className="text-[10px] text-gray-500 font-geneva-12 truncate">
                {formatUpdateTime(applet.createdAt)}
              </div>
            ) : applet.createdBy ? (
              <div className="text-[10px] text-gray-500 font-geneva-12 truncate">
                {applet.createdBy}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isAdmin && (
              <div className="flex items-center gap-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFeatured(applet.id, applet.featured || false);
                  }}
                  className="p-1 hover:bg-gray-200 rounded transition-all inline-flex md:hidden md:group-hover:inline-flex"
                  title={applet.featured ? t("apps.applet-viewer.labels.removeFromFeatured") : t("apps.applet-viewer.labels.addToFeatured")}
                >
                  <Star
                    className={`h-4 w-4 ${applet.featured ? "text-yellow-400" : "text-gray-400"}`}
                    weight={applet.featured ? "fill" : "bold"}
                  />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(applet.id);
                  }}
                  className="p-1 hover:bg-gray-200 rounded transition-all text-gray-400 inline-flex md:hidden md:group-hover:inline-flex"
                  title={t("apps.applet-viewer.labels.deleteApplet")}
                >
                  <Trash className="h-4 w-4" weight="bold" />
                </button>
              </div>
            )}
            <Button
              size="sm"
              variant={
                updateAvailable
                  ? "default"
                  : isMacTheme
                  ? "secondary"
                  : isSystem7Theme
                  ? "retro"
                  : "default"
              }
              onClick={(e) => {
                e.stopPropagation();
                focusWindow?.();
                if (installed) {
                  if (updateAvailable) {
                    handleInstall(applet);
                  } else {
                    handleAppletClick(applet);
                  }
                } else {
                  handleInstall(applet);
                }
              }}
              disabled={isBulkUpdating}
            >
              {installed ? (updateAvailable ? t("apps.applet-viewer.status.update") : t("apps.applet-viewer.status.open")) : t("apps.applet-viewer.status.get")}
            </Button>
          </div>
        </div>
      );
    };

  if (applets.length === 0) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center px-6 font-geneva-12">
            <p className="text-[11px] text-neutral-600 font-geneva-12">
              {t("apps.applet-viewer.dialogs.noAppletsAvailable")}
            </p>
          </div>
        </div>
      </>
    );
  }

  // Detail view for uninstalled applet
  if (selectedApplet) {
    const displayName = selectedApplet.title || selectedApplet.name || t("apps.applet-viewer.dialogs.untitledApplet");
    const displayIcon = selectedApplet.icon || "📱";
    
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="h-full w-full flex flex-col">
          {/* Detail view toolbar */}
          <div
            className={`flex items-center gap-3 px-3 py-2 ${
              isXpTheme
                ? "border-b border-[#919b9c]"
                : currentTheme === "macosx"
                ? ""
                : currentTheme === "system7"
                ? "bg-gray-100 border-b border-black"
                : "bg-gray-100 border-b border-gray-200"
            }`}
            style={{
              background: isXpTheme ? "transparent" : undefined,
              backgroundImage: currentTheme === "macosx" ? "var(--os-pinstripe-window)" : undefined,
              borderBottom:
                currentTheme === "macosx"
                  ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
                  : undefined,
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setSelectedApplet(null);
                setIsSharedApplet(false);
              }}
              className="h-7 w-7 flex-shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div 
              className="!text-2xl flex-shrink-0 applet-icon flex items-center justify-center"
              style={{ fontSize: '1.5rem' }}
            >
              {displayIcon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm font-geneva-12 truncate">
                {displayName}
              </div>
            </div>
            <Button
              size="sm"
              variant={isMacTheme ? "secondary" : isSystem7Theme ? "retro" : "default"}
              onClick={() => handleInstall(selectedApplet)}
              className="w-[60px]"
              disabled={isBulkUpdating}
            >
              {t("apps.applet-viewer.status.get")}
            </Button>
          </div>
            <div
              className="flex-1 overflow-hidden bg-white"
              onClick={() => {
                // Only handle click for installed applets to bring window to foreground
                if (selectedApplet) {
                  focusWindow?.();
                  handlePreviewClick(selectedApplet);
                }
              }}
            >
            {selectedAppletContent ? (
              <iframe
                srcDoc={ensureMacFonts(selectedAppletContent)}
                title={displayName}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
                style={{
                  display: "block",
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">{t("apps.applet-viewer.dialogs.loading")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{appletIconStyles}</style>
      <div className="h-full w-full flex flex-col">
        {!showListView ? (
            <div className="flex-1 overflow-hidden relative">
              <AppStoreFeed
                ref={feedRef}
                theme={theme}
                focusWindow={focusWindow}
                onAppletSelect={(applet) => {
                  focusWindow?.();
                  setSelectedApplet(applet);
                }}
              />
            {/* Navigation buttons overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
              <Button
                variant={isMacTheme ? "aqua" : "default"}
                size="sm"
                onClick={() => feedRef.current?.goToPrevious()}
                className={`h-7 w-7 p-0 flex items-center justify-center ${
                  isMacTheme ? "rounded-full" : "rounded-none"
                }`}
                style={{ height: "28px", width: "28px" }}
              >
                <CaretLeft className="h-4 w-4" weight="bold" />
              </Button>
              <Button
                variant={isMacTheme ? "aqua" : "default"}
                size="sm"
                onClick={() => setShowListView(true)}
                style={{ height: "28px" }}
              >
                <span className="text-sm font-medium font-geneva-12">{t("apps.applet-viewer.labels.showAll")}</span>
              </Button>
              <Button
                variant={isMacTheme ? "aqua" : "default"}
                size="sm"
                onClick={() => feedRef.current?.goToNext()}
                className={`h-7 w-7 p-0 flex items-center justify-center ${
                  isMacTheme ? "rounded-full" : "rounded-none"
                }`}
                style={{ height: "28px", width: "28px" }}
              >
                <CaretRight className="h-4 w-4" weight="bold" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`px-3 py-2 flex items-center gap-1 ${
                isXpTheme
                  ? "border-b border-[#919b9c]"
                  : currentTheme === "macosx"
                  ? ""
                  : currentTheme === "system7"
                  ? "bg-gray-100 border-b border-black"
                  : "bg-gray-100 border-b border-gray-200"
              }`}
              style={{
                background: isXpTheme ? "transparent" : undefined,
                backgroundImage: currentTheme === "macosx" ? "var(--os-pinstripe-window)" : undefined,
                borderBottom:
                  currentTheme === "macosx"
                    ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
                    : undefined,
              }}
            >
              <Input
                type="text"
                placeholder={t("apps.applet-viewer.labels.searchApplets")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`flex-1 pl-2 ${
                  isXpTheme
                    ? "!text-[11px]"
                    : currentTheme === "macosx"
                    ? "!text-[12px] h-[26px]"
                    : "!text-[16px]"
                }`}
                style={
                  currentTheme === "macosx"
                    ? {
                        paddingTop: "2px",
                        paddingBottom: "2px",
                      }
                    : undefined
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowListView(false)}
                className="flex items-center gap-1 px-1"
              >
                <Sparkle className="h-4 w-4" weight="fill" />
                <span className="text-xs font-geneva-12">{t("apps.applet-viewer.labels.discover")}</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="space-y-1">
                {filteredApplets.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[11px] text-neutral-600 font-geneva-12">
                      {t("apps.applet-viewer.dialogs.noAppletsFound", { query: searchQuery })}
                    </p>
                  </div>
                ) : (
                  <>
                    {updatesAvailable.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            {t("apps.applet-viewer.sections.updatesAvailable")}
                          </h3>
                        </div>
                        {updatesAvailable.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                    {featuredApplets.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            {t("apps.applet-viewer.sections.featured")}
                          </h3>
                        </div>
                        {featuredApplets.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                    {allApplets.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            {t("apps.applet-viewer.sections.newApplets")}
                          </h3>
                        </div>
                        {allApplets.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                    {installedApplets.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            {t("apps.applet-viewer.sections.installed")}
                          </h3>
                        </div>
                        {installedApplets.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
