import type { TFunction } from "i18next";
import type { AppId } from "@/config/appRegistry";
import { appRegistry, getAppIconPath, getNonFinderApps } from "@/config/appRegistry";
import { getTranslatedAppName, getTranslatedFolderNameFromName } from "@/utils/i18n";
import type { MenuItem } from "@/components/ui/right-click-menu";
import type { AppInstance } from "@/stores/useAppStore";
import type { FinderInstance } from "@/stores/useFinderStore";
import type { DockItem } from "@/stores/useDockStore";
import { PROTECTED_DOCK_ITEMS } from "@/stores/useDockStore";
import { DOCK_MULTI_WINDOW_APPS } from "./dockConstants";
import { toggleExposeView } from "@/utils/appEventBus";
import { requestCloseWindow } from "@/utils/windowUtils";
import { getDockAppletInfo } from "./dockAppletInfo";
import type { FileSystemItem } from "@/stores/useFilesStore";
import type { LaunchOriginRect } from "@/stores/useAppStore";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";

export function getDividerContextMenuItems(deps: {
  t: TFunction;
  dockHiding: boolean;
  dockMagnification: boolean;
  setDockHiding: (hiding: boolean) => void;
  setDockMagnification: (magnification: boolean) => void;
}): MenuItem[] {
  const { t, dockHiding, dockMagnification, setDockHiding, setDockMagnification } = deps;
  return [
    {
      type: "item",
      label: dockHiding ? t("common.dock.turnHidingOff") : t("common.dock.turnHidingOn"),
      onSelect: () => setDockHiding(!dockHiding),
    },
    {
      type: "item",
      label: dockMagnification
        ? t("common.dock.turnMagnificationOff")
        : t("common.dock.turnMagnificationOn"),
      onSelect: () => setDockMagnification(!dockMagnification),
    },
  ];
}

export function getAppContextMenuItems(
  deps: {
    t: TFunction;
    instances: Record<string, AppInstance>;
    finderInstances: Record<string, FinderInstance>;
    pinnedItems: DockItem[];
    getFileItem: (path: string) => FileSystemItem | undefined;
    launchApp: (appId: AppId, options?: LaunchAppOptions) => void;
    restoreInstance: (instanceId: string) => void;
    bringInstanceToForeground: (instanceId: string) => void;
    minimizeInstance: (instanceId: string) => void;
    closeAppInstance: (instanceId: string) => void;
    playZoomMinimize: () => void;
    removeDockItem: (id: string) => void;
    addDockItem: (item: DockItem, index?: number) => boolean;
  },
  appId: AppId,
  specificInstanceId?: string,
): MenuItem[] {
  const {
    t,
    instances,
    finderInstances,
    pinnedItems,
    getFileItem,
    launchApp,
    restoreInstance,
    bringInstanceToForeground,
    minimizeInstance,
    closeAppInstance,
    playZoomMinimize,
    removeDockItem,
    addDockItem,
  } = deps;

  const items: MenuItem[] = [];

  const appInstances = Object.values(instances).filter(
    (inst) => inst.appId === appId && inst.isOpen,
  );

  if (appInstances.length === 0 && !specificInstanceId) {
    items.push({
      type: "item",
      label: t("common.dock.open"),
      onSelect: () => {
        if (appId === "finder") {
          launchApp("finder", { initialPath: "/" });
        } else {
          launchApp(appId);
        }
      },
    });

    const isPinned = pinnedItems.some((item) => item.type === "app" && item.id === appId);
    const isProtected = PROTECTED_DOCK_ITEMS.has(appId);

    if (isPinned && !isProtected) {
      items.push({ type: "separator" });
      items.push({
        type: "item",
        label: t("common.dock.removeFromDock") || "Remove from Dock",
        onSelect: () => {
          removeDockItem(appId);
        },
      });
    }

    return items;
  }

  if (appId === "applet-viewer" && specificInstanceId) {
    const instance = instances[specificInstanceId];
    if (instance) {
      const { label } = getDockAppletInfo(instance, getFileItem, t);
      const isForeground = !!(instance.isForeground && !instance.isMinimized);
      items.push({
        type: "checkbox",
        label: `${label}${instance.isMinimized ? ` ${t("common.dock.minimized")}` : ""}`,
        checked: isForeground,
        onSelect: () => {
          if (instance.isMinimized) {
            restoreInstance(specificInstanceId);
          }
          bringInstanceToForeground(specificInstanceId);
        },
      });

      items.push({ type: "separator" });

      items.push({
        type: "item",
        label: t("common.dock.showAllWindows"),
        onSelect: () => {
          toggleExposeView();
        },
      });

      items.push({
        type: "item",
        label: t("common.dock.hide"),
        onSelect: () => {
          playZoomMinimize();
          minimizeInstance(specificInstanceId);
        },
        disabled: instance.isMinimized,
      });

      items.push({
        type: "item",
        label: t("common.dock.quit"),
        onSelect: () => {
          if (instance.isMinimized) {
            closeAppInstance(specificInstanceId);
          } else {
            requestCloseWindow(specificInstanceId);
          }
        },
      });

      return items;
    }
  }

  if (appInstances.length > 0) {
    appInstances.forEach((inst) => {
      let windowLabel = inst.displayTitle || inst.title || appRegistry[appId]?.name || appId;

      if (appId === "finder") {
        const finderState = finderInstances[inst.instanceId];
        if (finderState?.currentPath) {
          if (finderState.currentPath === "/") {
            windowLabel = t("apps.finder.window.macintoshHd");
          } else {
            const pathParts = finderState.currentPath.split("/");
            const lastSegment = pathParts[pathParts.length - 1] || "";
            try {
              const decodedName = decodeURIComponent(lastSegment);
              windowLabel = getTranslatedFolderNameFromName(decodedName);
            } catch {
              windowLabel = getTranslatedFolderNameFromName(lastSegment);
            }
          }
        }
      }

      const isForeground = !!(inst.isForeground && !inst.isMinimized);
      items.push({
        type: "checkbox",
        label: `${windowLabel}${inst.isMinimized ? ` ${t("common.dock.minimized")}` : ""}`,
        checked: isForeground,
        onSelect: () => {
          if (inst.isMinimized) {
            restoreInstance(inst.instanceId);
          }
          bringInstanceToForeground(inst.instanceId);
        },
      });
    });

    items.push({ type: "separator" });
  }

  if (DOCK_MULTI_WINDOW_APPS.includes(appId)) {
    items.push({
      type: "item",
      label: t("common.dock.newWindow"),
      onSelect: () => {
        if (appId === "finder") {
          launchApp("finder", { initialPath: "/" });
        } else {
          launchApp(appId);
        }
      },
    });

    items.push({ type: "separator" });
  }

  const isPinned = pinnedItems.some((item) => item.type === "app" && item.id === appId);
  const isProtected = PROTECTED_DOCK_ITEMS.has(appId);

  if (isPinned && !isProtected) {
    items.push({
      type: "item",
      label: t("common.dock.removeFromDock"),
      onSelect: () => {
        removeDockItem(appId);
      },
    });
    items.push({ type: "separator" });
  } else if (!isPinned && !isProtected && appInstances.length > 0) {
    items.push({
      type: "item",
      label: t("common.dock.addToDock"),
      onSelect: () => {
        addDockItem({ type: "app", id: appId });
      },
    });
    items.push({ type: "separator" });
  }

  items.push({
    type: "item",
    label: t("common.dock.showAllWindows"),
    onSelect: () => {
      toggleExposeView();
    },
    disabled: appInstances.length === 0,
  });

  items.push({
    type: "item",
    label: t("common.dock.hide"),
    onSelect: () => {
      playZoomMinimize();
      appInstances.forEach((inst) => {
        if (!inst.isMinimized) {
          minimizeInstance(inst.instanceId);
        }
      });
    },
    disabled: appInstances.length === 0 || appInstances.every((inst) => inst.isMinimized),
  });

  items.push({
    type: "item",
    label: t("common.dock.quit"),
    onSelect: () => {
      appInstances.forEach((inst) => {
        if (inst.isMinimized) {
          closeAppInstance(inst.instanceId);
        } else {
          requestCloseWindow(inst.instanceId);
        }
      });
    },
    disabled: appInstances.length === 0,
  });

  return items;
}

export function getFolderContextMenuItems(
  deps: {
    t: TFunction;
    isAdmin: boolean;
    isTrashEmpty: boolean;
    getFilesInPath: (path: string) => FileSystemItem[];
    getFileItem: (path: string) => FileSystemItem | undefined;
    focusFinderAtPathOrLaunch: (
      targetPath: string,
      initialData?: unknown,
      launchOrigin?: LaunchOriginRect,
    ) => void;
    focusOrLaunchFinder: (initialPath?: string, launchOrigin?: LaunchOriginRect) => void;
    focusOrLaunchApp: (
      appId: AppId,
      initialData?: unknown,
      launchOrigin?: LaunchOriginRect,
    ) => void;
    setTrashContextMenuPos: (pos: null) => void;
    setApplicationsContextMenuPos: (pos: null) => void;
    setIsEmptyTrashDialogOpen: (open: boolean) => void;
  },
  folderPath: string,
  isTrash: boolean = false,
): MenuItem[] {
  const {
    t,
    isAdmin,
    isTrashEmpty,
    getFilesInPath,
    getFileItem,
    focusFinderAtPathOrLaunch,
    focusOrLaunchFinder,
    focusOrLaunchApp,
    setTrashContextMenuPos,
    setApplicationsContextMenuPos,
    setIsEmptyTrashDialogOpen,
  } = deps;

  const items: MenuItem[] = [];

  let sortedItems: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    appId?: AppId;
    aliasType?: "file" | "app";
    aliasTarget?: string;
    icon?: string;
  }> = [];

  if (folderPath === "/Applications") {
    const apps = getNonFinderApps(isAdmin);
    sortedItems = apps
      .map((app) => ({
        name: app.name,
        path: `/Applications/${app.name}`,
        isDirectory: false,
        appId: app.id,
        aliasType: "app" as const,
        aliasTarget: app.id,
        icon: app.icon,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const folderItems = getFilesInPath(folderPath);
    sortedItems = folderItems
      .map((item) => {
        let icon: string | undefined;

        if (item.aliasType === "app" && item.aliasTarget) {
          icon = getAppIconPath(item.aliasTarget as AppId);
        } else if (item.aliasType === "file" && item.aliasTarget) {
          const targetFile = getFileItem(item.aliasTarget);
          icon = targetFile?.icon || "/icons/default/file.png";
        } else if (item.isDirectory) {
          icon = item.icon || "/icons/directory.png";
        } else if (item.icon) {
          icon = item.icon;
        } else {
          icon = "/icons/default/file.png";
        }

        return {
          name: item.name,
          path: item.path,
          isDirectory: item.isDirectory,
          appId: item.appId as AppId | undefined,
          aliasType: item.aliasType,
          aliasTarget: item.aliasTarget,
          icon,
        };
      })
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
  }

  items.push({
    type: "item",
    label: t("common.dock.open"),
    onSelect: () => {
      focusFinderAtPathOrLaunch(folderPath);
      if (isTrash) {
        setTrashContextMenuPos(null);
      } else {
        setApplicationsContextMenuPos(null);
      }
    },
  });

  if (sortedItems.length > 0) {
    items.push({ type: "separator" });

    const submenuItems: MenuItem[] = sortedItems.map((item) => {
      let displayName = item.name;

      if (item.isDirectory) {
        displayName = getTranslatedFolderNameFromName(item.name);
      } else if (item.aliasType === "app" && item.aliasTarget) {
        displayName = getTranslatedAppName(item.aliasTarget as AppId);
      } else if (item.appId) {
        displayName = getTranslatedAppName(item.appId);
      } else {
        displayName = item.name.replace(/\.[^/.]+$/, "");
      }

      return {
        type: "item",
        label: displayName,
        icon: item.icon,
        onSelect: () => {
          if (item.isDirectory) {
            focusFinderAtPathOrLaunch(item.path);
          } else if (item.appId) {
            const appId = item.appId;
            if (appId === "finder") {
              focusOrLaunchFinder("/");
            } else {
              focusOrLaunchApp(appId);
            }
          } else if (item.aliasType === "app" && item.aliasTarget) {
            const appId = item.aliasTarget as AppId;
            if (appId === "finder") {
              focusOrLaunchFinder("/");
            } else {
              focusOrLaunchApp(appId);
            }
          } else if (item.aliasType === "file" && item.aliasTarget) {
            const targetFile = getFileItem(item.aliasTarget);
            if (targetFile) {
              if (targetFile.isDirectory) {
                focusFinderAtPathOrLaunch(targetFile.path);
              } else {
                const parentPath = item.aliasTarget.substring(
                  0,
                  item.aliasTarget.lastIndexOf("/"),
                );
                focusFinderAtPathOrLaunch(parentPath || "/");
              }
            }
          } else {
            const parentPath = item.path.substring(0, item.path.lastIndexOf("/"));
            focusFinderAtPathOrLaunch(parentPath || "/");
          }
          if (isTrash) {
            setTrashContextMenuPos(null);
          } else {
            setApplicationsContextMenuPos(null);
          }
        },
      };
    });

    items.push({
      type: "submenu",
      label: t("common.dock.folderContents") || "Folder Contents",
      items: submenuItems,
    });
  }

  if (isTrash) {
    items.push({ type: "separator" });
    items.push({
      type: "item",
      label: t("apps.finder.contextMenu.emptyTrash"),
      onSelect: () => {
        setIsEmptyTrashDialogOpen(true);
        setTrashContextMenuPos(null);
      },
      disabled: isTrashEmpty,
    });
  }

  return items;
}
