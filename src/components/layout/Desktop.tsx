import { AnyApp } from "@/apps/base/types";
import { AppId } from "@/config/appRegistry";
import { useState, useRef, useCallback } from "react";
import { FileIcon } from "@/apps/finder/components/FileIcon";
import { getAppIconPath } from "@/config/appRegistry";
import { useWallpaper } from "@/hooks/useWallpaper";
import { RightClickMenu, MenuItem } from "@/components/ui/right-click-menu";
import { SortType } from "@/apps/finder/components/FinderMenuBar";
import { useLongPress } from "@/hooks/useLongPress";
import { useThemeStore } from "@/stores/useThemeStore";
import { useFilesStore, FileSystemItem } from "@/stores/useFilesStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import { dbOperations } from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { useTranslation } from "react-i18next";
import { getTranslatedAppName } from "@/utils/i18n";
import { useEventListener } from "@/hooks/useEventListener";

interface DesktopStyles {
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundRepeat?: string;
  backgroundPosition?: string;
  transition?: string;
}

interface DesktopProps {
  apps: AnyApp[];
  toggleApp: (appId: AppId, initialData?: unknown, launchOrigin?: LaunchOriginRect) => void;
  onClick?: () => void;
  desktopStyles?: DesktopStyles;
}

export function Desktop({
  apps,
  toggleApp,
  onClick,
  desktopStyles,
}: DesktopProps) {
  const { t } = useTranslation();
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
  const [isEmptyTrashDialogOpen, setIsEmptyTrashDialogOpen] = useState(false);

  // Get current theme for layout adjustments
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  
  // Check if running in Tauri
  const isTauriApp = typeof window !== "undefined" && "__TAURI__" in window;

  // File system and launch app hooks
  const fileStore = useFilesStore();
  const launchApp = useLaunchApp();
  
  // Get trash icon (updates automatically when trash state changes)
  const allItems = useFilesStore((state) => state.items);
  const trashIcon = fileStore.getItem("/Trash")?.icon || "/icons/trash-empty.png";

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
  const desktopShortcuts = Object.values(allItems)
    .filter(
      (item) =>
        item.status === "active" &&
        item.path.startsWith("/Desktop/") &&
        !item.isDirectory &&
        // Theme-conditional defaults: hide items that are marked hidden for
        // the current theme, but always show user-pinned (no hiddenOnThemes).
        (!item.hiddenOnThemes ||
          !item.hiddenOnThemes.includes(currentTheme))
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

  // Get display name for desktop shortcuts (with translation)
  const getDisplayName = (shortcut: FileSystemItem): string => {
    // For app aliases, use translated app name
    if (shortcut.aliasType === "app" && shortcut.aliasTarget) {
      return getTranslatedAppName(shortcut.aliasTarget as AppId);
    }
    // For file aliases, remove file extension
    return shortcut.name.replace(/\.[^/.]+$/, "");
  };

  // Resolve and open alias target
  const handleAliasOpen = async (shortcut: FileSystemItem, launchOrigin?: LaunchOriginRect) => {
    if (!shortcut.aliasTarget || !shortcut.aliasType) return;

    if (shortcut.aliasType === "app") {
      // Launch app directly
      const appId = shortcut.aliasTarget as AppId;
      toggleApp(appId, undefined, launchOrigin);
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
          launchApp(targetFile.appId as AppId, { launchOrigin });
        } else if (targetFile.path.startsWith("/Documents/")) {
          launchApp("textedit", {
            initialData: { path: targetFile.path, content: contentAsString ?? "" },
            launchOrigin,
          });
        } else if (targetFile.path.startsWith("/Images/")) {
          launchApp("paint", {
            initialData: { path: targetFile.path, content: contentToUse },
            launchOrigin,
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
            launchOrigin,
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

      // If this drag originated from an existing desktop shortcut, do not
      // create another alias. This prevents duplicate icons when dragging
      // items around on the desktop itself.
      if (path && path.startsWith("/Desktop/")) {
        return;
      }
      
      // Check if an alias already exists for this target
      const desktopItems = fileStore.getItemsInPath("/Desktop");
      let aliasExists = false;
      
      // Check if this is an app or a file/applet
      if (appId || (path && path.startsWith("/Applications/"))) {
        // It's an application - use appId from drag data or get from file system
        const finalAppId = appId || fileStore.getItem(path)?.appId;
        if (finalAppId) {
          // Check if alias already exists for this app
          const existingShortcut = desktopItems.find(
            (item) =>
              item.aliasType === "app" &&
              item.aliasTarget === finalAppId &&
              item.status === "active"
          );
          aliasExists = !!existingShortcut;

          if (aliasExists && existingShortcut) {
            // If this was a theme-conditional default, "fix" it by clearing
            // hidden themes so it shows regardless of theme.
            if (
              existingShortcut.hiddenOnThemes &&
              existingShortcut.hiddenOnThemes.length > 0
            ) {
              fileStore.updateItemMetadata(existingShortcut.path, {
                hiddenOnThemes: [],
              });
            }
          } else {
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

  const resumeVideoPlayback = useCallback(async () => {
    if (!isVideoWallpaper || !videoRef.current) return;

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
  }, [isVideoWallpaper]);

  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === "visible") {
      resumeVideoPlayback();
    }
  }, [resumeVideoPlayback]);

  const handleFocus = useCallback(() => {
    resumeVideoPlayback();
  }, [resumeVideoPlayback]);

  const handleCanPlayThrough = useCallback(() => {
    if (!isVideoWallpaper || !videoRef.current) return;

    const video = videoRef.current;
    if (video.paused) {
      video.play().catch((err) => {
        console.warn("Could not start video playback:", err);
      });
    }
  }, [isVideoWallpaper]);

  // Add visibility change and focus handlers to resume video playback
  useEventListener("visibilitychange", handleVisibilityChange, isVideoWallpaper ? document : null);
  useEventListener("focus", handleFocus, isVideoWallpaper ? window : null);

  // Add video ready state handling
  useEventListener(
    "canplaythrough",
    handleCanPlayThrough,
    isVideoWallpaper ? videoRef : null
  );

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
    localStorage.setItem("ryos:app:finder:initial-path", "/");
    const finderApp = apps.find((app) => app.id === "finder");
    if (finderApp) {
      const rect = e.currentTarget.getBoundingClientRect();
      const launchOrigin: LaunchOriginRect = {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      };
      toggleApp(finderApp.id, undefined, launchOrigin);
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
      localStorage.setItem("ryos:app:finder:initial-path", "/");
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

  const handleEmptyTrash = () => {
    setIsEmptyTrashDialogOpen(true);
  };

  const confirmEmptyTrash = async () => {
    // 1. Permanently delete metadata from FileStore and get UUIDs of files whose content needs deletion
    const contentUUIDsToDelete = fileStore.emptyTrash();

    // 2. Clear corresponding content from TRASH IndexedDB store
    try {
      // Delete content based on UUIDs collected from fileStore.emptyTrash()
      for (const uuid of contentUUIDsToDelete) {
        await dbOperations.delete(STORES.TRASH, uuid);
      }
      console.log("[Desktop] Cleared trash content from IndexedDB.");
    } catch (err) {
      console.error("Error clearing trash content from IndexedDB:", err);
    }
    
    setIsEmptyTrashDialogOpen(false);
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

  // macOS X: Only show iPod and Applet Store icons by default (with Macintosh HD shown above)
  const displayedApps =
    currentTheme === "macosx"
      ? sortedApps.filter(
          (app) => app.id === "ipod" || app.id === "applet-viewer"
        )
      : sortedApps;

  // Create default shortcuts based on theme
  // Note: Logic moved to useFilesStore.ts (ensureDefaultDesktopShortcuts)
  // to handle initialization race conditions.


  const getContextMenuItems = (): MenuItem[] => {
    if (contextMenuShortcutPath) {
      // Shortcut-specific context menu
      return [
        {
          type: "item",
          label: t("apps.finder.contextMenu.open"),
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
          label: t("apps.finder.contextMenu.moveToTrash"),
          onSelect: handleShortcutDelete,
        },
      ];
    } else if (contextMenuAppId) {
      // Icon-specific context menu
      if (contextMenuAppId === "trash") {
        return [
          {
            type: "item",
            label: t("apps.finder.contextMenu.open"),
            onSelect: () => {
              localStorage.setItem("ryos:app:finder:initial-path", "/Trash");
              const finderApp = apps.find((app) => app.id === "finder");
              if (finderApp) {
                toggleApp(finderApp.id);
              }
              setContextMenuPos(null);
              setContextMenuAppId(null);
            },
          },
        ];
      }
      return [
        {
          type: "item",
          label: t("apps.finder.contextMenu.open"),
          onSelect: () => handleOpenApp(contextMenuAppId),
        },
      ];
    } else {
      // Blank desktop context menu
      const trashItems = fileStore.getTrashItems();
      const isTrashEmpty = trashItems.length === 0;
      
      return [
        {
          type: "submenu",
          label: t("apps.finder.contextMenu.sortBy"),
          items: [
            {
              type: "radioGroup",
              value: sortType,
              onChange: (val) => setSortType(val as SortType),
              items: [
                { label: t("apps.finder.contextMenu.name"), value: "name" },
                { label: t("apps.finder.contextMenu.kind"), value: "kind" },
              ],
            },
          ],
        },
        { type: "separator" },
        {
          type: "item",
          label: t("apps.finder.contextMenu.emptyTrash"),
          onSelect: handleEmptyTrash,
          disabled: isTrashEmpty,
        },
        { type: "separator" },
        {
          type: "item",
          label: t("common.desktop.setWallpaper"),
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
      {/* Invisible draggable area for Tauri window on Windows themes */}
      {isTauriApp && isXpTheme && (
        <div
          className="fixed top-0 left-0 right-0 z-[100]"
          style={{
            height: 32,
            cursor: "default",
          }}
          onMouseDown={async (e) => {
            if (e.buttons !== 1) return;
            try {
              const { getCurrentWindow } = await import("@tauri-apps/api/window");
              if (e.detail === 2) {
                await getCurrentWindow().toggleMaximize();
              } else {
                await getCurrentWindow().startDragging();
              }
            } catch {
              // Ignore errors - Tauri window APIs may not be available in browser
            }
          }}
        />
      )}
      <div
        className={`flex flex-col relative z-[1] ${
          isXpTheme
            ? "items-start pt-2" // Reserve space via height, not padding, to avoid clipping
            : "items-end pt-8" // Account for top menubar - keep right alignment for other themes
        }`}
        style={
          isXpTheme
            ? {
                // Exclude menubar, safe area, and an extra visual buffer to prevent clipping
                // Add extra top padding for Tauri traffic lights on Windows themes
                height:
                  "calc(100% - (30px + var(--sat-safe-area-bottom) + 48px))",
                paddingTop: isTauriApp ? 36 : undefined,
                paddingLeft: "calc(0.25rem + env(safe-area-inset-left, 0px))",
                paddingRight: "calc(0.5rem + env(safe-area-inset-right, 0px))",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
              }
            : {
                height: "calc(100% - 2rem)",
                padding: "1rem",
                paddingTop: "2rem",
                paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
                paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
                paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
              }
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
            name={isXpTheme ? t("common.desktop.myComputer") : t("apps.finder.window.macintoshHd")}
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
                name={getDisplayName(shortcut)}
                isDirectory={false}
                icon={getShortcutIcon(shortcut)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedShortcutPath(shortcut.path);
                  setSelectedAppId(null);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const launchOrigin: LaunchOriginRect = {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                  };
                  handleAliasOpen(shortcut, launchOrigin);
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
              name={getTranslatedAppName(app.id as AppId)}
              isDirectory={false}
              icon={
                isXpTheme && app.id === "pc"
                  ? `/icons/${currentTheme}/games.png`
                  : getAppIconPath(app.id)
              }
              onClick={(e) => handleIconClick(app.id, e)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const launchOrigin: LaunchOriginRect = {
                  x: rect.left,
                  y: rect.top,
                  width: rect.width,
                  height: rect.height,
                };
                toggleApp(app.id, undefined, launchOrigin);
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
          {/* Display Trash icon at the end for non-macOS X themes */}
          {currentTheme !== "macosx" && (
            <FileIcon
              name={t("common.menu.trash")}
              isDirectory={true}
              icon={trashIcon}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAppId("trash");
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                localStorage.setItem("ryos:app:finder:initial-path", "/Trash");
                const finderApp = apps.find((app) => app.id === "finder");
                if (finderApp) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const launchOrigin: LaunchOriginRect = {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height,
                  };
                  toggleApp(finderApp.id, undefined, launchOrigin);
                }
                setSelectedAppId(null);
              }}
              onContextMenu={(e: React.MouseEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenuPos({ x: e.clientX, y: e.clientY });
                setContextMenuAppId("trash");
                setContextMenuShortcutPath(null);
                setSelectedAppId("trash");
              }}
              isSelected={selectedAppId === "trash"}
              size="large"
              data-desktop-icon="true"
            />
          )}
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
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={confirmEmptyTrash}
        title={t("apps.finder.dialogs.emptyTrash.title")}
        description={t("apps.finder.dialogs.emptyTrash.description")}
      />
    </div>
  );
}
