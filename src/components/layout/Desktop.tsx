import { AnyApp } from "@/apps/base/types";
import { AppManagerState } from "@/apps/base/types";
import { AppId } from "@/config/appRegistry";
import { useState, useEffect, useRef } from "react";
import { FileIcon } from "@/apps/finder/components/FileIcon";
import { getAppIconPath } from "@/config/appRegistry";
import { useWallpaper } from "@/hooks/useWallpaper";
import { RightClickMenu, MenuItem } from "@/components/ui/right-click-menu";
import { SortType } from "@/apps/finder/components/FinderMenuBar";
import { useLongPress } from "@/hooks/useLongPress";
import { useThemeStore } from "@/stores/useThemeStore";
import { useFilesStore, FileSystemItem } from "@/stores/useFilesStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { dbOperations } from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";

interface DesktopStyles {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  transition?: string;
}

interface DesktopProps {
  apps: AnyApp[];
  appStates: AppManagerState;
  toggleApp: (appId: AppId, initialData?: unknown) => void;
  onClick?: () => void;
  desktopStyles?: DesktopStyles;
}

export function Desktop({
  apps,
  toggleApp,
  onClick,
  desktopStyles,
}: DesktopProps) {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedShortcutPath, setSelectedShortcutPath] = useState<string | null>(null);
  const { wallpaperSource, isVideoWallpaper } = useWallpaper();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sortType, setSortType] = useState<SortType>("name");
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [contextMenuAppId, setContextMenuAppId] = useState<string | null>(null);
  const [contextMenuShortcutPath, setContextMenuShortcutPath] = useState<string | null>(null);

  // Get current theme for layout adjustments
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  // File system and launch app hooks
  const fileStore = useFilesStore();
  const launchApp = useLaunchApp();

  // Define the default order for desktop shortcuts
  const defaultShortcutOrder: AppId[] = [
    "ipod",
    "chats",
    "applet-viewer",
    "internet-explorer",
    "textedit",
    "photo-booth",
    "videos",
    "paint",
    "soundboard",
    "minesweeper",
    "synth",
    "terminal",
    "pc",
  ];

  // Get desktop shortcuts - subscribe to store changes
  // Access items directly to ensure reactivity
  const allItems = useFilesStore((state) => state.items);
  const desktopShortcuts = Object.values(allItems)
    .filter(
      (item) =>
        item.status === "active" &&
        item.path.startsWith("/Desktop/") &&
        !item.isDirectory
    )
    .sort((a, b) => {
      // Sort by default order if both are app aliases
      if (a.aliasType === "app" && b.aliasType === "app") {
        const aIndex = defaultShortcutOrder.indexOf(a.aliasTarget as AppId);
        const bIndex = defaultShortcutOrder.indexOf(b.aliasTarget as AppId);
        
        // If both are in the order list, sort by their position
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }
        // If only one is in the list, prioritize it
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        // If neither is in the list, sort alphabetically by name
        return a.name.localeCompare(b.name);
      }
      // App aliases come before file aliases
      if (a.aliasType === "app" && b.aliasType !== "app") return -1;
      if (a.aliasType !== "app" && b.aliasType === "app") return 1;
      // Both are file aliases, sort alphabetically
      return a.name.localeCompare(b.name);
    });

  // Remove file extension from display name (for desktop shortcuts)
  const getDisplayName = (name: string): string => {
    // Remove common file extensions
    return name.replace(/\.[^/.]+$/, "");
  };

  // Resolve and open alias target
  const handleAliasOpen = async (shortcut: FileSystemItem) => {
    if (!shortcut.aliasTarget || !shortcut.aliasType) return;

    if (shortcut.aliasType === "app") {
      // Launch app directly
      const appId = shortcut.aliasTarget as AppId;
      toggleApp(appId);
    } else {
      // Open file/applet - need to resolve the original file
      const targetPath = shortcut.aliasTarget;
      const targetFile = fileStore.getItem(targetPath);
      
      if (!targetFile) {
        console.warn(`[Desktop] Target file not found: ${targetPath}`);
        return;
      }

      // Use useFileSystem hook logic to open the file
      // We need to fetch content and launch appropriate app
      try {
        let contentToUse: string | Blob | undefined = undefined;
        let contentAsString: string | undefined = undefined;

        if (
          targetFile.path.startsWith("/Documents/") ||
          targetFile.path.startsWith("/Images/") ||
          targetFile.path.startsWith("/Applets/")
        ) {
          if (targetFile.uuid) {
            const storeName = targetFile.path.startsWith("/Documents/")
              ? STORES.DOCUMENTS
              : targetFile.path.startsWith("/Images/")
              ? STORES.IMAGES
              : STORES.APPLETS;
            
            const contentData = await dbOperations.get<{ name: string; content: string | Blob }>(
              storeName,
              targetFile.uuid
            );
            
            if (contentData) {
              contentToUse = contentData.content;
              if (contentToUse instanceof Blob) {
                if (targetFile.path.startsWith("/Documents/") || targetFile.path.startsWith("/Applets/")) {
                  contentAsString = await contentToUse.text();
                }
              } else if (typeof contentToUse === "string") {
                contentAsString = contentToUse;
              }
            }
          }
        }

        // Launch appropriate app based on file type
        if (targetFile.path.startsWith("/Applications/") && targetFile.appId) {
          launchApp(targetFile.appId as AppId);
        } else if (targetFile.path.startsWith("/Documents/")) {
          launchApp("textedit", {
            initialData: { path: targetFile.path, content: contentAsString ?? "" },
          });
        } else if (targetFile.path.startsWith("/Images/")) {
          launchApp("paint", {
            initialData: { path: targetFile.path, content: contentToUse },
          });
        } else if (
          targetFile.path.startsWith("/Applets/") &&
          (targetFile.path.endsWith(".app") || targetFile.path.endsWith(".html"))
        ) {
          launchApp("applet-viewer", {
            initialData: {
              path: targetFile.path,
              content: contentAsString ?? "",
            },
          });
        }
      } catch (err) {
        console.error(`[Desktop] Error opening alias target:`, err);
      }
    }
  };

  // Handle drag and drop from Finder
  const handleDragOver = (e: React.DragEvent) => {
    // Only accept drops from Finder (application/json data)
    if (e.dataTransfer.types.includes("application/json")) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const jsonData = e.dataTransfer.getData("application/json");
      if (!jsonData) return;

      const { path, name, appId } = JSON.parse(jsonData);
      
      // Check if an alias already exists for this target
      const desktopItems = fileStore.getItemsInPath("/Desktop");
      let aliasExists = false;
      
      // Check if this is an app or a file/applet
      if (appId || (path && path.startsWith("/Applications/"))) {
        // It's an application - use appId from drag data or get from file system
        const finalAppId = appId || fileStore.getItem(path)?.appId;
        if (finalAppId) {
          // Check if alias already exists for this app
          aliasExists = desktopItems.some(
            (item) =>
              item.aliasType === "app" &&
              item.aliasTarget === finalAppId &&
              item.status === "active"
          );
          
          if (!aliasExists) {
            fileStore.createAlias(path || "", name, "app", finalAppId);
          }
        }
      } else if (path) {
        // It's a file or applet
        const sourceItem = fileStore.getItem(path);
        if (sourceItem) {
          // Check if alias already exists for this file
          aliasExists = desktopItems.some(
            (item) =>
              item.aliasType === "file" &&
              item.aliasTarget === path &&
              item.status === "active"
          );
          
          if (!aliasExists) {
            fileStore.createAlias(path, name, "file");
          }
        }
      }
    } catch (err) {
      console.error("[Desktop] Error handling drop:", err);
    }
  };

  // ------------------ Mobile long-press support ------------------
  // Show the desktop context menu after the user holds for 500 ms.
  const longPressHandlers = useLongPress((e) => {
    // Check if the target is within an icon - if so, don't show desktop context menu
    const target = e.target as HTMLElement;
    const iconContainer = target.closest("[data-desktop-icon]");
    if (iconContainer) {
      return; // Let the icon handle its own context menu
    }

    const touch = e.touches[0];
    setContextMenuPos({ x: touch.clientX, y: touch.clientY });
    setContextMenuAppId(null);
  });

  // Add visibility change and focus handlers to resume video playback
  useEffect(() => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const resumeVideoPlayback = async () => {
      const video = videoRef.current;
      if (!video) return;

      try {
        // If video has ended, reset it to the beginning
        if (video.ended) {
          video.currentTime = 0;
        }

        // Only attempt to play if the video is ready
        if (video.readyState >= 3) {
          // HAVE_FUTURE_DATA or better
          await video.play();
        } else {
          // If video isn't ready, wait for it to be ready
          const handleCanPlay = () => {
            video.play().catch((err) => {
              console.warn("Could not resume video playback:", err);
            });
            video.removeEventListener("canplay", handleCanPlay);
          };
          video.addEventListener("canplay", handleCanPlay);
        }
      } catch (err) {
        console.warn("Could not resume video playback:", err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resumeVideoPlayback();
      }
    };

    const handleFocus = () => {
      resumeVideoPlayback();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [isVideoWallpaper]);

  // Add video ready state handling
  useEffect(() => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const video = videoRef.current;
    const handleCanPlayThrough = () => {
      if (video.paused) {
        video.play().catch((err) => {
          console.warn("Could not start video playback:", err);
        });
      }
    };

    video.addEventListener("canplaythrough", handleCanPlayThrough);
    return () => {
      video.removeEventListener("canplaythrough", handleCanPlayThrough);
    };
  }, [isVideoWallpaper]);

  const getWallpaperStyles = (path: string): DesktopStyles => {
    if (!path || isVideoWallpaper) return {};

    const isTiled = path.includes("/wallpapers/tiles/");
    return {
      backgroundImage: `url(${path})`,
      backgroundSize: isTiled ? "64px 64px" : "cover",
      backgroundRepeat: isTiled ? "repeat" : "no-repeat",
      backgroundPosition: "center",
      transition: "background-image 0.3s ease-in-out",
    };
  };

  const finalStyles = {
    ...getWallpaperStyles(wallpaperSource),
    ...desktopStyles,
  };

  const handleIconClick = (
    appId: string,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.stopPropagation();
    setSelectedAppId(appId);
  };

  const handleFinderOpen = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    localStorage.setItem("app_finder_initialPath", "/");
    const finderApp = apps.find((app) => app.id === "finder");
    if (finderApp) {
      toggleApp(finderApp.id);
    }
    setSelectedAppId(null);
  };

  const handleIconContextMenu = (appId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuAppId(appId);
    setContextMenuShortcutPath(null);
    setSelectedAppId(appId);
  };

  const handleShortcutContextMenu = (shortcutPath: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuShortcutPath(shortcutPath);
    setContextMenuAppId(null);
    setSelectedShortcutPath(shortcutPath);
  };

  const handleShortcutDelete = () => {
    if (!contextMenuShortcutPath) return;
    const shortcut = fileStore.getItem(contextMenuShortcutPath);
    if (shortcut) {
      // Use fileStore.removeItem which moves to trash
      fileStore.removeItem(contextMenuShortcutPath);
    }
    setContextMenuPos(null);
    setContextMenuShortcutPath(null);
  };

  const handleOpenApp = (appId: string) => {
    if (appId === "macintosh-hd") {
      localStorage.setItem("app_finder_initialPath", "/");
      const finderApp = apps.find((app) => app.id === "finder");
      if (finderApp) {
        toggleApp(finderApp.id);
      }
    } else {
      toggleApp(appId as AppId);
    }
    setSelectedAppId(null);
    setContextMenuPos(null);
  };

  // Compute sorted apps based on selected sort type
  const sortedApps = [...apps]
    .filter(
      (app) =>
        app.id !== "finder" &&
        app.id !== "control-panels" &&
        app.id !== "applet-viewer"
    )
    .sort((a, b) => {
      switch (sortType) {
        case "name":
          return a.name.localeCompare(b.name);
        case "kind":
          return a.id.localeCompare(b.id);
        default:
          return 0;
      }
    });

  // macOS X: Only show iPod app icon on desktop (with Macintosh HD shown above)
  const displayedApps =
    currentTheme === "macosx"
      ? sortedApps.filter((app) => app.id === "ipod")
      : sortedApps;

  // Create default shortcuts based on theme
  useEffect(() => {
    // Ensure apps are loaded and Desktop folder exists
    if (!apps || apps.length === 0) return;
    
    const desktopFolder = fileStore.getItem("/Desktop");
    if (!desktopFolder || !desktopFolder.isDirectory) {
      // Desktop folder doesn't exist yet, wait for it to be initialized
      return;
    }

    // Get current desktop shortcuts
    const desktopItems = fileStore.getItemsInPath("/Desktop");
    
    // Define the default order for desktop shortcuts
    const defaultOrder: AppId[] = [
      "ipod",
      "chats",
      "applet-viewer",
      "internet-explorer",
      "textedit",
      "photo-booth",
      "videos",
      "paint",
      "soundboard",
      "minesweeper",
      "synth",
      "terminal",
      "pc",
    ];

    // Determine which apps should have shortcuts based on theme
    let appsToShortcut: typeof apps;
    if (currentTheme === "macosx") {
      // macOS X: chats, ipod, applet-viewer, internet-explorer
      appsToShortcut = apps.filter(
        (app) =>
          app.id === "chats" ||
          app.id === "ipod" ||
          app.id === "applet-viewer" ||
          app.id === "internet-explorer"
      );
    } else {
      // Other themes: All apps except finder and control-panels
      appsToShortcut = apps.filter(
        (app) =>
          app.id !== "finder" &&
          app.id !== "control-panels"
      );
    }

    // Sort apps according to default order, then alphabetically for any not in the list
    const sortedAppsToShortcut = [...appsToShortcut].sort((a, b) => {
      const aIndex = defaultOrder.indexOf(a.id as AppId);
      const bIndex = defaultOrder.indexOf(b.id as AppId);
      
      // If both are in the order list, sort by their position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in the list, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // If neither is in the list, sort alphabetically
      return a.name.localeCompare(b.name);
    });

    // Create shortcuts for apps that don't have them yet, in the specified order
    sortedAppsToShortcut.forEach((app) => {
      // Check if shortcut already exists
      const existingShortcut = desktopItems.find(
        (item) => item.aliasType === "app" && item.aliasTarget === app.id
      );
      if (!existingShortcut) {
        // Use app path if available
        const appPath = `/Applications/${app.name}`;
        fileStore.createAlias(appPath, app.name, "app", app.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, currentTheme]);

  const getContextMenuItems = (): MenuItem[] => {
    if (contextMenuShortcutPath) {
      // Shortcut-specific context menu
      return [
        {
          type: "item",
          label: "Open",
          onSelect: () => {
            const shortcut = fileStore.getItem(contextMenuShortcutPath);
            if (shortcut) {
              handleAliasOpen(shortcut);
            }
            setContextMenuPos(null);
            setContextMenuShortcutPath(null);
          },
        },
        { type: "separator" },
        {
          type: "item",
          label: "Move to Trash",
          onSelect: handleShortcutDelete,
        },
      ];
    } else if (contextMenuAppId) {
      // Icon-specific context menu
      return [
        {
          type: "item",
          label: "Open",
          onSelect: () => handleOpenApp(contextMenuAppId),
        },
      ];
    } else {
      // Blank desktop context menu
      return [
        {
          type: "submenu",
          label: "Sort By",
          items: [
            {
              type: "radioGroup",
              value: sortType,
              onChange: (val) => setSortType(val as SortType),
              items: [
                { label: "Name", value: "name" },
                { label: "Kind", value: "kind" },
              ],
            },
          ],
        },
        { type: "separator" },
        {
          type: "item",
          label: "Set Wallpaper…",
          onSelect: () => toggleApp("control-panels"),
        },
      ];
    }
  };

  // Resolve icon for shortcut
  const getShortcutIcon = (shortcut: FileSystemItem): string => {
    // For app aliases, always resolve from app registry (ignore stored icon)
    if (shortcut.aliasType === "app" && shortcut.aliasTarget) {
      const appId = shortcut.aliasTarget as AppId;
      try {
        const iconPath = getAppIconPath(appId);
        if (iconPath) {
          return iconPath;
        }
        console.warn(`[Desktop] getAppIconPath returned empty for app ${appId}`);
      } catch (err) {
        console.warn(`[Desktop] Failed to resolve icon for app ${appId}:`, err);
      }
      return "/icons/default/application.png";
    }
    
    // For file aliases, use stored icon or resolve from target
    if (shortcut.icon && shortcut.icon.trim() !== "") {
      return shortcut.icon;
    }
    
    if (shortcut.aliasType === "file" && shortcut.aliasTarget) {
      const targetFile = fileStore.getItem(shortcut.aliasTarget);
      return targetFile?.icon || "/icons/default/file.png";
    }
    
    return "/icons/default/file.png";
  };

  return (
    <div
      className="absolute inset-0 min-h-screen h-full z-[-1] desktop-background"
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenuPos({ x: e.clientX, y: e.clientY });
        setContextMenuAppId(null);
        setContextMenuShortcutPath(null);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={finalStyles}
      {...longPressHandlers}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover z-[-10]"
        src={wallpaperSource}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        data-webkit-playsinline="true"
        style={{
          display: isVideoWallpaper ? "block" : "none",
        }}
      />
      <div
        className={`flex flex-col relative z-[1] ${
          isXpTheme
            ? "items-start pt-2 pr-2 pl-1 pb-0" // Reserve space via height, not padding, to avoid clipping
            : "items-end pt-8 h-[calc(100%-2rem)] p-4" // Account for top menubar - keep right alignment for other themes
        }`}
        style={
          isXpTheme
            ? {
                // Exclude menubar, safe area, and an extra visual buffer to prevent clipping
                height:
                  "calc(100% - (30px + var(--sat-safe-area-bottom) + 48px))",
                paddingBottom: 0,
              }
            : undefined
        }
      >
        <div
          className={
            isXpTheme
              ? "flex flex-col flex-wrap justify-start content-start h-full gap-y-2 gap-x-px"
              : "flex flex-col flex-wrap-reverse justify-start content-start h-full gap-y-2 gap-x-px"
          }
        >
          <FileIcon
            name={isXpTheme ? "My Computer" : "Macintosh HD"}
            isDirectory={true}
            icon={
              isXpTheme ? "/icons/default/pc.png" : "/icons/default/disk.png"
            }
            onClick={(e) => {
              e.stopPropagation();
              setSelectedAppId("macintosh-hd");
            }}
            onDoubleClick={handleFinderOpen}
            onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
              handleIconContextMenu("macintosh-hd", e)
            }
            isSelected={selectedAppId === "macintosh-hd"}
            size="large"
          />
          {/* Display desktop shortcuts */}
          {desktopShortcuts.map((shortcut) => (
            <div
              key={shortcut.path}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({
                    path: shortcut.path,
                    name: shortcut.name,
                    appId: shortcut.appId,
                    aliasType: shortcut.aliasType,
                    aliasTarget: shortcut.aliasTarget,
                  })
                );
                // Set drag image
                const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
                dragImage.style.position = "absolute";
                dragImage.style.top = "-1000px";
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                setTimeout(() => document.body.removeChild(dragImage), 0);
              }}
            >
              <FileIcon
                name={getDisplayName(shortcut.name)}
                isDirectory={false}
                icon={getShortcutIcon(shortcut)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedShortcutPath(shortcut.path);
                  setSelectedAppId(null);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleAliasOpen(shortcut);
                  setSelectedShortcutPath(null);
                }}
                onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                  handleShortcutContextMenu(shortcut.path, e)
                }
                isSelected={selectedShortcutPath === shortcut.path}
                size="large"
                data-desktop-icon="true"
              />
            </div>
          ))}
          {/* Display regular app icons (only if not using shortcuts) */}
          {desktopShortcuts.length === 0 && displayedApps.map((app) => (
            <FileIcon
              key={app.id}
              name={app.name}
              isDirectory={false}
              icon={
                isXpTheme && app.id === "pc"
                  ? `/icons/${currentTheme}/games.png`
                  : getAppIconPath(app.id)
              }
              onClick={(e) => handleIconClick(app.id, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                toggleApp(app.id);
                setSelectedAppId(null);
              }}
              onContextMenu={(e: React.MouseEvent<HTMLDivElement>) =>
                handleIconContextMenu(app.id, e)
              }
              isSelected={selectedAppId === app.id}
              size="large"
              data-desktop-icon="true"
            />
          ))}
        </div>
      </div>
      <RightClickMenu
        position={contextMenuPos}
        onClose={() => {
          setContextMenuPos(null);
          setContextMenuAppId(null);
          setContextMenuShortcutPath(null);
        }}
        items={getContextMenuItems()}
      />
    </div>
  );
}
