import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useChatsStore } from "@/stores/useChatsStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { Trash2, Star, ArrowLeft, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { useAppletActions, type Applet } from "../utils/appletActions";
import { AppStoreFeed, type AppStoreFeedRef } from "./AppStoreFeed";

interface AppStoreProps {
  theme?: string;
  sharedAppletId?: string; // ID of shared applet to show in detail view
}

export function AppStore({ theme, sharedAppletId }: AppStoreProps) {
  const [applets, setApplets] = useState<Applet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApplet, setSelectedApplet] = useState<Applet | null>(null);
  const [selectedAppletContent, setSelectedAppletContent] = useState<string>("");
  const [isSharedApplet, setIsSharedApplet] = useState(false);
  const [showListView, setShowListView] = useState(false);
  const feedRef = useRef<AppStoreFeedRef>(null);
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const isAdmin = username?.toLowerCase() === "ryo" && !!authToken;
  const isMacTheme = theme === "macosx";
  const isSystem7Theme = theme === "system7";
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  
  const actions = useAppletActions();


  const fetchApplets = async () => {
    try {
      const response = await fetch("/api/share-applet?list=true");
      if (response.ok) {
        const data = await response.json();
        // Sort by createdAt descending (latest first)
        const sortedApplets = (data.applets || []).sort((a: Applet, b: Applet) => {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        setApplets(sortedApplets);
      }
    } catch (error) {
      console.error("Error fetching applets:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplets();
  }, []);

  // If sharedAppletId is provided, fetch and show that applet in detail view
  useEffect(() => {
    if (sharedAppletId) {
      const fetchSharedApplet = async () => {
        try {
          const response = await fetch(`/api/share-applet?id=${encodeURIComponent(sharedAppletId)}`);
          if (response.ok) {
            const data = await response.json();
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
          } else {
            toast.error("Shared applet not found", {
              description: "The shared applet may have been deleted or the link is invalid.",
            });
          }
        } catch (error) {
          console.error("Error fetching shared applet:", error);
          toast.error("Failed to load shared applet", {
            description: "Please check your connection and try again.",
          });
        }
      };
      fetchSharedApplet();
    }
  }, [sharedAppletId]);

  // Fetch applet content when selectedApplet changes (but skip if content already loaded from sharedAppletId)
  useEffect(() => {
    if (selectedApplet) {
      // If content is already set (from sharedAppletId fetch), don't fetch again
      if (selectedAppletContent && isSharedApplet) {
        return;
      }
      // Reset content immediately to show loading
      setSelectedAppletContent("");
      fetch(`/api/share-applet?id=${encodeURIComponent(selectedApplet.id)}`)
        .then((response) => {
          if (response.ok) {
            return response.json();
          }
          throw new Error("Failed to fetch applet content");
        })
        .then((data) => {
          setSelectedAppletContent(data.content || "");
        })
        .catch((error) => {
          console.error("Error fetching applet content:", error);
          // Keep content empty to show loading state indefinitely
          setSelectedAppletContent("");
        });
    } else {
      setSelectedAppletContent("");
    }
  }, [selectedApplet, isSharedApplet]);

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
    const result = await actions.handleAppletClick(applet);
    if (result) {
      setSelectedApplet(result);
    }
  };

  const handleInstall = async (applet: Applet) => {
    await actions.handleInstall(applet, async () => {
      await fetchApplets();
      setSelectedApplet(null);
    });
  };

  const handleDelete = async (appletId: string) => {
    if (!isAdmin) return;
    
    if (!confirm("Are you sure you want to delete this applet?")) {
      return;
    }

    try {
      const response = await fetch(`/api/share-applet?id=${encodeURIComponent(appletId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Username": username!,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete applet");
      }

      toast.success("Applet deleted");
      fetchApplets(); // Refresh list
    } catch (error) {
      console.error("Error deleting applet:", error);
      toast.error("Failed to delete applet", {
        description: "Please try again later.",
      });
    }
  };

  const handleToggleFeatured = async (appletId: string, currentFeatured: boolean) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/share-applet?id=${encodeURIComponent(appletId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Username": username!,
        },
        body: JSON.stringify({ featured: !currentFeatured }),
      });

      if (!response.ok) {
        throw new Error("Failed to update featured status");
      }

      toast.success(currentFeatured ? "Removed from featured" : "Added to featured");
      fetchApplets(); // Refresh list
    } catch (error) {
      console.error("Error updating featured status:", error);
      toast.error("Failed to update featured status", {
        description: "Please try again later.",
      });
    }
  };

  // Add CSS to ensure emoji size doesn't get overridden by theme styles
  const appletIconStyles = `
    .applet-icon {
      font-size: 2.25rem !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
  `;

  if (isLoading) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="h-full w-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-gray-600 font-geneva-12 shimmer-gray">Loading...</p>
          </div>
        </div>
      </>
    );
  }

  // Filter applets based on search query
  const filteredApplets = applets.filter((applet) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const displayName = (applet.title || applet.name || "Untitled Applet").toLowerCase();
    const createdBy = (applet.createdBy || "").toLowerCase();
    return displayName.includes(query) || createdBy.includes(query);
  });

  // Separate into updates available, installed (no updates), featured (not installed), and all (not installed, not featured)
  // Sort each group by createdAt descending (latest first)
  const updatesAvailable = filteredApplets
    .filter((applet) => actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const installedApplets = filteredApplets
    .filter((applet) => actions.isAppletInstalled(applet.id) && !actions.needsUpdate(applet))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const featuredApplets = filteredApplets
    .filter((applet) => applet.featured && !actions.isAppletInstalled(applet.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const allApplets = filteredApplets
    .filter((applet) => !applet.featured && !actions.isAppletInstalled(applet.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

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
      if (diffMins < 1) return "Updated just now";
      if (diffMins < 60) return `Updated ${diffMins}m ago`;
      return `Updated ${diffHours}h ago`;
    }

    if (diffDays === 1) return "Updated yesterday";
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `Updated ${weeks}w ago`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `Updated ${months}mo ago`;
    }
    const years = Math.floor(diffDays / 365);
    return `Updated ${years}y ago`;
  };

  // Render a single applet item
  const renderAppletItem = (applet: Applet) => {
    const displayName = applet.title || applet.name || "Untitled Applet";
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
          if (target.closest('button') || target.closest('[role="button"]')) {
            return;
          }
          handleAppletClick(applet);
        }}
      >
        <div 
          className="!text-4xl flex-shrink-0 applet-icon flex items-center justify-center"
          style={{ fontSize: '2.25rem', width: '3rem' }}
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
                title={applet.featured ? "Remove from featured" : "Add to featured"}
              >
                <Star 
                  className={`h-4 w-4 ${applet.featured ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} 
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(applet.id);
                }}
                className="p-1 hover:bg-gray-200 rounded transition-all text-gray-400 inline-flex md:hidden md:group-hover:inline-flex"
                title="Delete applet"
              >
                <Trash2 className="h-4 w-4" />
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
            className="w-[60px]"
          >
            {installed ? (updateAvailable ? "Update" : "Open") : "Get"}
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
            <p className="text-[11px] text-gray-600 font-geneva-12">
              No applets available at this time.
            </p>
          </div>
        </div>
      </>
    );
  }

  // Detail view for uninstalled applet
  if (selectedApplet) {
    const displayName = selectedApplet.title || selectedApplet.name || "Untitled Applet";
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
                : "bg-gray-100 border-b border-gray-300"
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
            >
              Get
            </Button>
          </div>
          <div className="flex-1 overflow-hidden bg-white">
            {selectedAppletContent ? (
              <iframe
                srcDoc={ensureMacFonts(selectedAppletContent)}
                title={displayName}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
                style={{
                  display: "block",
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-geneva-12 shimmer-gray">Loading...</p>
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
              onAppletSelect={(applet) => setSelectedApplet(applet)}
            />
            {/* Navigation buttons overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
              <Button
                variant={isMacTheme ? "aqua" : "default"}
                size="sm"
                onClick={() => feedRef.current?.goToPrevious()}
                className={`w-9 h-9 p-0 flex items-center justify-center ${
                  isMacTheme ? "rounded-full" : "rounded-none"
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={isMacTheme ? "aqua" : "default"}
                size="sm"
                onClick={() => setShowListView(true)}
              >
                <span className="text-sm font-medium font-geneva-12">Show All</span>
              </Button>
              <Button
                variant={isMacTheme ? "aqua" : "default"}
                size="sm"
                onClick={() => feedRef.current?.goToNext()}
                className={`w-9 h-9 p-0 flex items-center justify-center ${
                  isMacTheme ? "rounded-full" : "rounded-none"
                }`}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`px-3 py-2 flex items-center gap-2 ${
                isXpTheme
                  ? "border-b border-[#919b9c]"
                  : currentTheme === "macosx"
                  ? ""
                  : currentTheme === "system7"
                  ? "bg-gray-100 border-b border-black"
                  : "bg-gray-100 border-b border-gray-300"
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
                placeholder="Search applets"
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
                className="flex items-center gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-geneva-12">Discover</span>
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="space-y-1">
                {filteredApplets.length === 0 ? (
                  <div className="px-3 py-4 text-center">
                    <p className="text-[11px] text-gray-600 font-geneva-12">
                      No applets found matching "{searchQuery}".
                    </p>
                  </div>
                ) : (
                  <>
                    {updatesAvailable.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            Updates Available
                          </h3>
                        </div>
                        {updatesAvailable.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                    {featuredApplets.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            Featured
                          </h3>
                        </div>
                        {featuredApplets.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                    {allApplets.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            New Applets
                          </h3>
                        </div>
                        {allApplets.map((applet) => renderAppletItem(applet))}
                      </>
                    )}
                    {installedApplets.length > 0 && (
                      <>
                        <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                          <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                            Installed
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
