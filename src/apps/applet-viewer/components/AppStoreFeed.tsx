import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useAppletActions, type Applet } from "../utils/appletActions";
import { motion, AnimatePresence } from "framer-motion";
import {
  APPLET_AUTH_BRIDGE_SCRIPT,
  APPLET_AUTH_MESSAGE_TYPE,
} from "@/utils/appletAuthBridge";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { useChatsStoreShallow } from "@/stores/helpers";

interface AppStoreFeedProps {
  theme?: string;
  focusWindow?: () => void;
  onAppletSelect?: (applet: Applet) => void;
}

export interface AppStoreFeedRef {
  goToNext: () => void;
  goToPrevious: () => void;
}

export const AppStoreFeed = forwardRef<AppStoreFeedRef, AppStoreFeedProps>(
  ({ theme, focusWindow, onAppletSelect }, ref) => {
  const { t } = useTranslation();
  const [applets, setApplets] = useState<Applet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "backward" | "none">("none");
  const [appletContents, setAppletContents] = useState<Map<string, string>>(new Map());
  const [loadingContents, setLoadingContents] = useState<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());
  // Use useLatestRef to keep refs in sync with state without effects
  const currentIndexRef = useLatestRef(currentIndex);
  const appletsLengthRef = useLatestRef(applets.length);
  const hasFetchedRef = useRef(false);
  const sessionSeedRef = useRef(Math.floor(Math.random() * 1000000));
  const currentTheme = useThemeStore((state) => state.current);
  const { username, authToken } = useChatsStoreShallow((state) => ({
    username: state.username,
    authToken: state.authToken,
  }));

  // Stacking constants (similar to TimeMachineView)
  const MAX_VISIBLE_PREVIEWS = 4;
  const PREVIEW_Z_SPACING = -80;
  const PREVIEW_SCALE_FACTOR = 0.05;
  const PREVIEW_Y_SPACING = -28;
  const isMacTheme = theme === "macosx" || currentTheme === "macosx";
  const isSystem7Theme = theme === "system7" || currentTheme === "system7";
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const actions = useAppletActions();

  // Add CSS to ensure emoji size doesn't get overridden by theme styles
  const appletIconStyles = `
    .applet-icon {
      font-size: 2.25rem !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
  `;

  // Ensure macOSX theme uses Lucida Grande/system/emoji-safe fonts inside iframe content
  // Also inject auth bridge script for API authentication
  const ensureMacFonts = (content: string): string => {
    if (!content) return content;
    
    const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
    const fontStyle = isMacTheme ? `<style data-ryos-applet-font-fix>
      html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
      *{font-family:inherit!important}
      h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    </style>` : '';
    
    const injectedContent = `${APPLET_AUTH_BRIDGE_SCRIPT}${preload}${fontStyle}`;

    const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
    if (headCloseIdx !== -1) {
      return (
        content.slice(0, headCloseIdx) +
        injectedContent +
        content.slice(headCloseIdx)
      );
    }

    const bodyOpenIdx = content.toLowerCase().indexOf("<body");
    if (bodyOpenIdx !== -1) {
      const bodyTagEnd = content.indexOf(">", bodyOpenIdx) + 1;
      return (
        content.slice(0, bodyTagEnd) +
        injectedContent +
        content.slice(bodyTagEnd)
      );
    }

    return injectedContent + content;
  };

  // Send auth payload to iframe
  const sendAuthPayload = useCallback(
    (target: Window | null | undefined) => {
      if (!target) return;
      try {
        target.postMessage(
          {
            type: APPLET_AUTH_MESSAGE_TYPE,
            action: "response",
            payload: {
              username: username ?? null,
              authToken: authToken ?? null,
            },
          },
          window.location.origin
        );
      } catch (error) {
        console.warn("[AppStoreFeed] Failed to post auth payload:", error);
      }
    },
    [username, authToken]
  );

  // Listen for auth requests from iframes
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (
        !data ||
        data.type !== APPLET_AUTH_MESSAGE_TYPE ||
        data.action !== "request"
      ) {
        return;
      }

      if (event.origin !== window.location.origin) {
        return;
      }

      const sourceWindow = event.source as Window | null;
      if (!sourceWindow) {
        return;
      }

      // Check if the message is from one of our applet preview iframes
      const iframes = feedRef.current?.querySelectorAll("iframe");
      const frameWindows: Window[] = [];
      iframes?.forEach((iframe) => {
        if (iframe.contentWindow) {
          frameWindows.push(iframe.contentWindow);
        }
      });

      if (!frameWindows.includes(sourceWindow)) {
        return;
      }

      sendAuthPayload(sourceWindow);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [sendAuthPayload]);

  // Send auth payload to all iframes when auth changes
  useEffect(() => {
    const iframes = feedRef.current?.querySelectorAll("iframe");
    iframes?.forEach((iframe) => {
      sendAuthPayload(iframe.contentWindow || undefined);
    });
  }, [username, authToken, sendAuthPayload, appletContents]);

  const fetchApplets = useCallback(async () => {
    // Check if offline
    if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
      setIsLoading(false);
      return;
    }
    // Seeded random number generator for deterministic shuffling
    const seededRandom = (seed: number) => {
      let value = seed;
      return () => {
        value = (value * 9301 + 49297) % 233280;
        return value / 233280;
      };
    };

    // Deterministic shuffle using session seed + category identifier
    const deterministicShuffle = <T extends { id: string }>(array: T[], categorySeed: number): T[] => {
      if (array.length === 0) return array;
      
      // Combine session seed with category seed for stable but random order
      const seed = (sessionSeedRef.current + categorySeed) % 1000000;
      const random = seededRandom(seed);
      
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };
    try {
      const response = await fetch(getApiUrl("/api/share-applet?list=true"));
      if (response.ok) {
        const data = await response.json();
        const allApplets = data.applets || [];
        
        // Categorize applets by priority
        const featured: Applet[] = [];
        const withUpdates: Applet[] = [];
        const notInstalled: Applet[] = [];
        const others: Applet[] = [];
        
        allApplets.forEach((applet: Applet) => {
          const installed = actions.isAppletInstalled(applet.id);
          const needsUpdate = actions.needsUpdate(applet);
          const isFeatured = applet.featured === true;
          
          if (isFeatured) {
            featured.push(applet);
          } else if (needsUpdate && installed) {
            withUpdates.push(applet);
          } else if (!installed) {
            notInstalled.push(applet);
          } else {
            others.push(applet);
          }
        });
        
        // Shuffle each category deterministically using category-specific seeds
        // Combine in priority order: featured, updates, not installed, others
        const sortedApplets = [
          ...deterministicShuffle(featured, 1),
          ...deterministicShuffle(withUpdates, 2),
          ...deterministicShuffle(notInstalled, 3),
          ...deterministicShuffle(others, 4),
        ];
        
        setApplets(sortedApplets);
      }
    } catch (error) {
      console.error("Error fetching applets:", error);
    } finally {
      setIsLoading(false);
    }
  }, [actions]);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchApplets();
    }
  }, [fetchApplets]);

  // Fetch applet content only for the current applet
  useEffect(() => {
    const fetchAppletContent = async (appletId: string) => {
      if (loadedRef.current.has(appletId) || loadingRef.current.has(appletId)) {
        return;
      }

      loadingRef.current.add(appletId);
      setLoadingContents((prev) => new Set(prev).add(appletId));

      try {
        const response = await fetch(getApiUrl(`/api/share-applet?id=${encodeURIComponent(appletId)}`));
        if (response.ok) {
          const data = await response.json();
          loadedRef.current.add(appletId);
          setAppletContents((prev) => {
            const next = new Map(prev);
            next.set(appletId, data.content || "");
            return next;
          });
        }
      } catch (error) {
        console.error(`Error fetching applet content for ${appletId}:`, error);
      } finally {
        loadingRef.current.delete(appletId);
        setLoadingContents((prev) => {
          const next = new Set(prev);
          next.delete(appletId);
          return next;
        });
      }
    };

    // Only load the current applet
    if (applets.length > 0 && applets[currentIndex]) {
      fetchAppletContent(applets[currentIndex].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, applets.length]);

  // Handle wheel navigation for edge detection and toolbar
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const containerRect = container.getBoundingClientRect();
      const isInToolbar = e.clientY - containerRect.top < 60;
      
      // If in toolbar, navigate
      if (isInToolbar && Math.abs(e.deltaY) > 30) {
        e.preventDefault();
        if (e.deltaY > 0 && currentIndex < applets.length - 1) {
          scrollToIndex(currentIndex + 1);
        } else if (e.deltaY < 0 && currentIndex > 0) {
          scrollToIndex(currentIndex - 1);
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [currentIndex, applets.length]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        if (currentIndex < applets.length - 1) {
          scrollToIndex(currentIndex + 1);
        }
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        if (currentIndex > 0) {
          scrollToIndex(currentIndex - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, applets.length]);

  const scrollToIndex = (index: number) => {
    if (index >= 0 && index < appletsLengthRef.current) {
      const prevIndex = currentIndexRef.current;
      setCurrentIndex(index);
      // Note: currentIndexRef.current is automatically updated by useLatestRef
      
      // Determine navigation direction
      if (index > prevIndex) {
        setNavigationDirection("forward");
      } else if (index < prevIndex) {
        setNavigationDirection("backward");
      } else {
        setNavigationDirection("none");
      }
    }
  };

  // Note: Removed useEffect hooks that synced refs with state
  // useLatestRef handles this automatically during render

  useImperativeHandle(ref, () => ({
    goToNext: () => {
      if (currentIndexRef.current < appletsLengthRef.current - 1) {
        scrollToIndex(currentIndexRef.current + 1);
      }
    },
    goToPrevious: () => {
      if (currentIndexRef.current > 0) {
        scrollToIndex(currentIndexRef.current - 1);
      }
    },
  }), []);

  const handleInstall = async (applet: Applet) => {
    focusWindow?.();
    await actions.handleInstall(applet, () => {
      // Reset fetch flag to allow refresh after install
      hasFetchedRef.current = false;
      fetchApplets();
    });
  };

  const handleAppletClick = async (applet: Applet) => {
    focusWindow?.();
    const result = await actions.handleAppletClick(applet);
    if (result && onAppletSelect) {
      onAppletSelect(result);
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

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">{t("apps.applet-viewer.dialogs.loading")}</p>
        </div>
      </div>
    );
  }

  if (applets.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center px-6 font-geneva-12">
          <p className="text-[11px] text-neutral-600 font-geneva-12">
            {t("apps.applet-viewer.dialogs.noAppletsAvailable")}
          </p>
        </div>
      </div>
    );
  }

  const renderAppletCard = (applet: Applet, index: number) => {
    const displayName = applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet");
    const displayIcon = applet.icon || "📱";
    const installed = actions.isAppletInstalled(applet.id);
    const updateAvailable = actions.needsUpdate(applet);
    const content = appletContents.get(applet.id);
    const isLoadingContent = loadingContents.has(applet.id);

    return (
      <div
        key={applet.id}
        data-applet-index={index}
        data-applet-card
        className="h-full w-full relative"
        style={{ minHeight: "100%" }}
      >
        {/* Applet Preview iframe */}
        <div 
          className="absolute inset-0" 
          style={{ paddingTop: "54px" }}
          onClick={() => {
            // Only handle click for installed applets to bring window to foreground
            if (index === currentIndex) {
              handlePreviewClick(applet);
            }
          }}
          onWheel={(e) => {
            // Only handle wheel for the current applet
            if (index !== currentIndex) return;

            // Let the iframe handle its own scrolling first
            const iframe = e.currentTarget.querySelector('iframe') as HTMLIFrameElement;
            if (!iframe) return;

            // Check scroll state after a short delay to let iframe scroll first
            setTimeout(() => {
              try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) return;

                const scrollTop = iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop || 0;
                const scrollHeight = iframeDoc.documentElement.scrollHeight || iframeDoc.body.scrollHeight || 0;
                const clientHeight = iframeDoc.documentElement.clientHeight || iframeDoc.body.clientHeight || 0;
                
                const atTop = scrollTop <= 5;
                const atBottom = scrollTop + clientHeight >= scrollHeight - 5;
                const canScroll = scrollHeight > clientHeight;

                // If at edge and trying to scroll further, navigate
                if (e.deltaY < 0 && atTop && currentIndex > 0 && canScroll) {
                  scrollToIndex(currentIndex - 1);
                } else if (e.deltaY > 0 && atBottom && currentIndex < applets.length - 1 && canScroll) {
                  scrollToIndex(currentIndex + 1);
                } else if (!canScroll && Math.abs(e.deltaY) > 30) {
                  // If can't scroll, navigate based on wheel direction
                  if (e.deltaY > 0 && currentIndex < applets.length - 1) {
                    scrollToIndex(currentIndex + 1);
                  } else if (e.deltaY < 0 && currentIndex > 0) {
                    scrollToIndex(currentIndex - 1);
                  }
                }
              } catch {
                // Cross-origin or other error - allow navigation if no scroll
                if (Math.abs(e.deltaY) > 30) {
                  if (e.deltaY > 0 && currentIndex < applets.length - 1) {
                    scrollToIndex(currentIndex + 1);
                  } else if (e.deltaY < 0 && currentIndex > 0) {
                    scrollToIndex(currentIndex - 1);
                  }
                }
              }
            }, 100);
          }}
        >
          {content ? (
            <iframe
              srcDoc={ensureMacFonts(content)}
              title={displayName}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
              style={{
                display: "block",
              }}
            />
          ) : isLoadingContent ? (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">{t("apps.applet-viewer.dialogs.loading")}</p>
              </div>
            </div>
          ) : (
            <div className="h-full w-full bg-gray-50" />
          )}
        </div>

        {/* Header toolbar with applet info and button */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-3 py-2 ${
            isXpTheme
              ? "border-b border-[#919b9c]"
              : currentTheme === "macosx"
              ? ""
              : currentTheme === "system7"
              ? "bg-gray-100 border-b border-black"
              : "bg-gray-100 border-b border-gray-200"
          }`}
          style={{
            flexWrap: "nowrap",
            background: isXpTheme ? "transparent" : undefined,
            backgroundImage: currentTheme === "macosx" ? "var(--os-pinstripe-window)" : undefined,
            borderBottom:
              currentTheme === "macosx"
                ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
                : undefined,
          }}
        >
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
            {applet.createdBy && (
              <div className="text-[10px] text-gray-500 font-geneva-12 truncate">
                {applet.createdBy}
              </div>
            )}
          </div>
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
            className="flex-shrink-0 whitespace-nowrap"
          >
            {installed ? (updateAvailable ? t("apps.applet-viewer.status.update") : t("apps.applet-viewer.status.open")) : t("apps.applet-viewer.status.get")}
          </Button>
        </div>
      </div>
    );
  };

  // Calculate visible applets (similar to TimeMachineView)
  const startIndex = Math.max(0, currentIndex);
  const endIndexExclusive = Math.min(
    applets.length,
    currentIndex + MAX_VISIBLE_PREVIEWS + 1
  );
  const visibleApplets = applets.slice(startIndex, endIndexExclusive);

  // Exit animation variants
  const exitVariants = {
    exit: (direction: "forward" | "backward" | "none") => {
      if (direction === "backward") {
        return {
          opacity: 0,
          z: PREVIEW_Z_SPACING,
          scale: 1 - PREVIEW_SCALE_FACTOR,
          y: PREVIEW_Y_SPACING,
          transition: { type: "spring" as const, stiffness: 150, damping: 25 },
        };
      } else {
        return {
          opacity: 0,
          z: 50,
          scale: 1.05,
          y: -PREVIEW_Y_SPACING,
          transition: { type: "spring" as const, stiffness: 150, damping: 25 },
        };
      }
    },
  };

  return (
    <>
      <style>{appletIconStyles}</style>
      <div
        ref={feedRef}
        className="h-full w-full overflow-hidden bg-black/20 flex items-center justify-center"
        style={{
          position: "relative",
          perspective: "calc(100vh * 1.25)",
          transformStyle: "preserve-3d",
        }}
        >
          <div 
            className="relative w-full flex items-center justify-center"
            style={{ 
              transformStyle: "preserve-3d",
              height: "100%",
              maxHeight: "1200px",
            }}
          >
            <AnimatePresence initial={false} custom={navigationDirection}>
              {visibleApplets.map((applet, indexInSlice) => {
                const originalIndex = startIndex + indexInSlice;
                const distance = originalIndex - currentIndex;
                const opacity = 1 / (distance + 1);
                const zIndex = applets.length - originalIndex;

                return (
                  <motion.div
                    key={applet.id}
                    className="absolute w-[90%] h-[75%] max-w-4xl rounded-2xl shadow-2xl overflow-hidden bg-white"
                    style={{
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
                      transformStyle: "preserve-3d",
                      clipPath: "inset(0 round 1rem)",
                      zIndex: zIndex,
                      transformOrigin: "center center",
                      rotateX: distance !== 0 ? -5 : 0,
                      pointerEvents: distance === 0 ? "auto" : "none",
                      maxHeight: "720px",
                      top: "12.5%",
                    }}
                  initial={(() => {
                    const base = {
                      z: distance * PREVIEW_Z_SPACING,
                      scale: 1 - distance * PREVIEW_SCALE_FACTOR,
                      y: distance * PREVIEW_Y_SPACING,
                      opacity: 0,
                    } as const;

                    if (distance === 0 && navigationDirection === "forward") {
                      return {
                        z: 50,
                        scale: 1.05,
                        y: -PREVIEW_Y_SPACING,
                        opacity: 0,
                      } as const;
                    }

                    return base;
                  })()}
                  animate={{
                    z: distance * PREVIEW_Z_SPACING,
                    y: distance * PREVIEW_Y_SPACING,
                    scale: 1 - distance * PREVIEW_SCALE_FACTOR,
                    opacity: opacity,
                  }}
                  variants={exitVariants}
                  exit="exit"
                  transition={{
                    type: "spring",
                    stiffness: 150,
                    damping: 25,
                  }}
                  drag={distance === 0 ? true : false}
                  dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                  dragElastic={0.4}
                  dragPropagation={false}
                  dragDirectionLock={true}
                  dragMomentum={false}
                  onDragStart={(event) => {
                    if (distance !== 0) return;
                    
                    // Store drag start position to check if it's on toolbar
                    const target = event.target as HTMLElement;
                    const card = target.closest('[data-applet-card]') as HTMLElement;
                    if (!card) return;
                    
                    const cardRect = card.getBoundingClientRect();
                    const dragY = 'touches' in event 
                      ? event.touches[0]?.clientY 
                      : (event as MouseEvent).clientY;
                    
                    // Mark if drag started on toolbar
                    (card as HTMLElement & { __dragOnToolbar?: boolean }).__dragOnToolbar = dragY ? (dragY - cardRect.top < 60) : false;
                  }}
                  onDrag={(event, info) => {
                    if (distance !== 0) return;
                    
                    // Determine primary drag direction
                    const target = event.target as HTMLElement;
                    const card = target.closest('[data-applet-card]') as HTMLElement & { _primaryDragAxis?: 'x' | 'y' };
                    if (card) {
                      const absX = Math.abs(info.offset.x);
                      const absY = Math.abs(info.offset.y);
                      card._primaryDragAxis = absX > absY ? 'x' : 'y';
                    }
                  }}
                  onDragEnd={(event, info) => {
                    if (distance !== 0) return;
                    
                    const target = event.target as HTMLElement;
                    const card = target.closest('[data-applet-card]') as HTMLElement & { __dragOnToolbar?: boolean; _primaryDragAxis?: 'x' | 'y' } | null;
                    const dragOnToolbar = card?.__dragOnToolbar;
                    const primaryAxis = card?._primaryDragAxis || 'y';
                    
                    // Handle horizontal swipe (left/right) - both go to next
                    if (primaryAxis === 'x') {
                      const threshold = 30; // Lower threshold for easier swiping
                      const velocity = info.velocity.x;
                      
                      // Both left and right swipes go to next card
                      if (currentIndex < applets.length - 1) {
                        // Check velocity first (fast swipe) - lower threshold
                        if (Math.abs(velocity) > 300) {
                          scrollToIndex(currentIndex + 1);
                          return;
                        }
                        
                        // Check drag distance - lower threshold
                        if (Math.abs(info.offset.x) > threshold) {
                          scrollToIndex(currentIndex + 1);
                        }
                      }
                      return;
                    }
                    
                    // Handle vertical swipe (up/down) - only if not dragging on toolbar
                    if (!dragOnToolbar) {
                      const iframe = card?.querySelector('iframe') as HTMLIFrameElement;
                      if (iframe) {
                        try {
                          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                          if (iframeDoc) {
                            const scrollTop = iframeDoc.documentElement.scrollTop || iframeDoc.body.scrollTop || 0;
                            const scrollHeight = iframeDoc.documentElement.scrollHeight || iframeDoc.body.scrollHeight || 0;
                            const clientHeight = iframeDoc.documentElement.clientHeight || iframeDoc.body.clientHeight || 0;
                            
                            const atTop = scrollTop <= 5;
                            const atBottom = scrollTop + clientHeight >= scrollHeight - 5;
                            const canScroll = scrollHeight > clientHeight;
                            
                            // Only navigate if at edge or can't scroll
                            if (canScroll) {
                              const draggingUp = info.offset.y < 0;
                              const draggingDown = info.offset.y > 0;
                              
                              if ((draggingUp && !atTop) || (draggingDown && !atBottom)) {
                                // Not at edge, don't navigate
                                return;
                              }
                            }
                          }
                        } catch {
                          // Cross-origin - allow navigation
                        }
                      }
                    }
                    
                    const threshold = 30; // Lower threshold for easier swiping
                    const velocity = info.velocity.y;
                    
                    // Check velocity first (fast swipe) - lower threshold
                    if (Math.abs(velocity) > 300) {
                      if (velocity > 0 && currentIndex < applets.length - 1) {
                        scrollToIndex(currentIndex + 1);
                      } else if (velocity < 0 && currentIndex > 0) {
                        scrollToIndex(currentIndex - 1);
                      }
                      return;
                    }
                    
                    // Check drag distance - lower threshold
                    if (Math.abs(info.offset.y) > threshold) {
                      if (info.offset.y > 0 && currentIndex < applets.length - 1) {
                        scrollToIndex(currentIndex + 1);
                      } else if (info.offset.y < 0 && currentIndex > 0) {
                        scrollToIndex(currentIndex - 1);
                      }
                    }
                  }}
                  whileDrag={{
                    scale: 0.98,
                    transition: { duration: 0.1 },
                  }}
                >
                  {renderAppletCard(applet, originalIndex)}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
  }
);
