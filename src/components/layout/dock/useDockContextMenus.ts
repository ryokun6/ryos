import { useCallback } from "react";
import type { TFunction } from "i18next";
import type { AppId } from "@/config/appRegistry";
import type { MenuItem } from "@/components/ui/right-click-menu";
import type { AppInstance, LaunchOriginRect } from "@/stores/useAppStore";
import type { FinderInstance } from "@/stores/useFinderStore";
import type { DockItem } from "@/stores/useDockStore";
import type { FileSystemItem } from "@/stores/useFilesStore";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";
import { useAppStore } from "@/stores/useAppStore";
import {
  getAppContextMenuItems as buildAppContextMenuItems,
  getDividerContextMenuItems as buildDividerContextMenuItems,
  getFolderContextMenuItems as buildFolderContextMenuItems,
} from "./dockContextMenus";

export interface UseDockContextMenusParams {
  t: TFunction;
  instances: Record<string, AppInstance>;
  finderInstances: Record<string, FinderInstance>;
  pinnedItems: DockItem[];
  dockHiding: boolean;
  dockMagnification: boolean;
  setDockHiding: (hiding: boolean) => void;
  setDockMagnification: (magnification: boolean) => void;
  isAdmin: boolean;
  isTrashEmpty: boolean;
  getFileItem: (path: string) => FileSystemItem | undefined;
  getFilesInPath: (path: string) => FileSystemItem[];
  launchApp: (appId: AppId, options?: LaunchAppOptions) => void;
  restoreInstance: (instanceId: string) => void;
  bringInstanceToForeground: (instanceId: string) => void;
  minimizeInstance: (instanceId: string) => void;
  closeAppInstance: (instanceId: string) => void;
  playZoomMinimize: () => void;
  removeDockItem: (id: string) => void;
  addDockItem: (item: DockItem, index?: number) => boolean;
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
}

export function useDockContextMenus(params: UseDockContextMenusParams) {
  const {
    t,
    instances,
    finderInstances,
    pinnedItems,
    dockHiding,
    dockMagnification,
    setDockHiding,
    setDockMagnification,
    isAdmin,
    isTrashEmpty,
    getFileItem,
    getFilesInPath,
    launchApp,
    restoreInstance,
    bringInstanceToForeground,
    minimizeInstance,
    closeAppInstance,
    playZoomMinimize,
    removeDockItem,
    addDockItem,
    focusFinderAtPathOrLaunch,
    focusOrLaunchFinder,
    focusOrLaunchApp,
    setTrashContextMenuPos,
    setApplicationsContextMenuPos,
    setIsEmptyTrashDialogOpen,
  } = params;

  const getDividerContextMenuItems = useCallback((): MenuItem[] => {
    return buildDividerContextMenuItems({
      t,
      dockHiding,
      dockMagnification,
      setDockHiding,
      setDockMagnification,
    });
  }, [dockHiding, dockMagnification, setDockHiding, setDockMagnification, t]);

  const getAppContextMenuItems = useCallback(
    (appId: AppId, specificInstanceId?: string): MenuItem[] => {
      return buildAppContextMenuItems(
        {
          t,
          instances,
          foregroundInstanceId: useAppStore.getState().foregroundInstanceId,
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
        },
        appId,
        specificInstanceId,
      );
    },
    [
      instances,
      finderInstances,
      getFileItem,
      restoreInstance,
      bringInstanceToForeground,
      minimizeInstance,
      closeAppInstance,
      playZoomMinimize,
      launchApp,
      pinnedItems,
      removeDockItem,
      addDockItem,
      t,
    ],
  );

  const getFolderContextMenuItems = useCallback(
    (folderPath: string, isTrash: boolean = false): MenuItem[] => {
      return buildFolderContextMenuItems(
        {
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
        },
        folderPath,
        isTrash,
      );
    },
    [
      getFilesInPath,
      getFileItem,
      focusFinderAtPathOrLaunch,
      focusOrLaunchFinder,
      focusOrLaunchApp,
      isTrashEmpty,
      t,
      isAdmin,
      setTrashContextMenuPos,
      setApplicationsContextMenuPos,
      setIsEmptyTrashDialogOpen,
    ],
  );

  return {
    getDividerContextMenuItems,
    getAppContextMenuItems,
    getFolderContextMenuItems,
  };
}
