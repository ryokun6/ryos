import React from "react";
import type { MotionValue } from "framer-motion";
import { getAppIconPath, type AppId } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { PROTECTED_DOCK_ITEMS, type DockItem } from "@/stores/useDockStore";
import type { AppInstance, LaunchOriginRect } from "@/stores/useAppStore";
import { DockSpacer } from "./DockSpacer";
import { DockIconButton } from "./DockIconButton";
import { computeDockPinnedItems } from "./dockPinnedList";

export interface DockPinnedItemsProps {
  pinnedItems: DockItem[];
  externalDragIndex: number | null;
  openAppsAllSet: Set<AppId>;
  instances: Record<string, AppInstance>;
  mouseX: MotionValue<number>;
  effectiveMagnifyEnabled: boolean;
  scaledButtonSize: number;
  iconRefsMap: React.MutableRefObject<Map<string, HTMLDivElement>>;
  hasMounted: boolean;
  seenIdsRef: React.MutableRefObject<Set<string>>;
  hoveredId: string | null;
  isSwapping: boolean;
  handleIconHover: (id: string) => void;
  handleIconLeave: () => void;
  draggingItemId: string | null;
  isDraggedOutside: boolean;
  handleItemDragStart: (e: React.DragEvent, itemId: string, index: number) => void;
  handleItemDragEnd: (e: React.DragEvent, itemId: string) => void;
  handleItemDragOver: (e: React.DragEvent, index: number) => void;
  handleAppContextMenu: (
    e: React.MouseEvent<HTMLButtonElement>,
    appId: AppId,
    instanceId?: string,
  ) => void;
  focusOrLaunchFinder: (
    initialPath?: string,
    launchOrigin?: LaunchOriginRect,
  ) => void;
  focusOrLaunchApp: (
    appId: AppId,
    initialData?: unknown,
    launchOrigin?: LaunchOriginRect,
  ) => void;
  getFileItem: (path: string) => FileSystemItem | undefined;
  launchApp: (
    appId: AppId,
    options?: {
      initialData?: unknown;
      launchOrigin?: LaunchOriginRect;
    },
  ) => void;
}

// Returns a flat array of keyed dock icons (not a wrapping component) so the
// callers can spread them as DIRECT children of <AnimatePresence>/<LayoutGroup>.
// Wrapping these in a component/fragment hides the individual icons from
// AnimatePresence, breaking per-icon enter/exit/layout tracking and producing
// transient empty slots when items mount or unmount.
export function renderDockPinnedItems({
  pinnedItems,
  externalDragIndex,
  openAppsAllSet,
  instances,
  mouseX,
  effectiveMagnifyEnabled,
  scaledButtonSize,
  iconRefsMap,
  hasMounted,
  seenIdsRef,
  hoveredId,
  isSwapping,
  handleIconHover,
  handleIconLeave,
  draggingItemId,
  isDraggedOutside,
  handleItemDragStart,
  handleItemDragEnd,
  handleItemDragOver,
  handleAppContextMenu,
  focusOrLaunchFinder,
  focusOrLaunchApp,
  getFileItem,
  launchApp,
}: DockPinnedItemsProps): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  const renderablePinnedItems = computeDockPinnedItems(pinnedItems);

  renderablePinnedItems.forEach((item, index) => {
    if (externalDragIndex === index) {
      elements.push(
        <DockSpacer
          key="dock-drop-spacer"
          idKey="dock-drop-spacer"
          mouseX={mouseX}
          magnifyEnabled={effectiveMagnifyEnabled}
          baseSize={scaledButtonSize}
        />,
      );
    }

    if (item.type === "app") {
      const appId = item.id as AppId;
      const icon = getAppIconPath(appId);
      const isOpen = openAppsAllSet.has(appId);
      const isLoading = Object.values(instances).some(
        (i) => i.appId === appId && i.isOpen && i.isLoading,
      );
      const label = getTranslatedAppName(appId);
      const isProtected = PROTECTED_DOCK_ITEMS.has(item.id);

      elements.push(
        <DockIconButton
          key={appId}
          ref={(el) => {
            if (el) iconRefsMap.current.set(item.id, el);
            else iconRefsMap.current.delete(item.id);
          }}
          label={label}
          icon={icon}
          idKey={appId}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const launchOrigin: LaunchOriginRect = {
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
            };
            if (appId === "finder") {
              focusOrLaunchFinder("/", launchOrigin);
            } else {
              focusOrLaunchApp(appId, undefined, launchOrigin);
            }
          }}
          onContextMenu={(e) => handleAppContextMenu(e, appId)}
          showIndicator={isOpen}
          isLoading={isLoading}
          mouseX={mouseX}
          magnifyEnabled={effectiveMagnifyEnabled}
          isNew={hasMounted && !seenIdsRef.current.has(appId)}
          isHovered={hoveredId === appId}
          isSwapping={isSwapping}
          onHover={() => handleIconHover(appId)}
          onLeave={handleIconLeave}
          draggable={!isProtected}
          onDragStart={(e) => handleItemDragStart(e, item.id, index)}
          onDragEnd={(e) => handleItemDragEnd(e, item.id)}
          onDragOver={(e) => handleItemDragOver(e, index)}
          isDragging={draggingItemId === item.id}
          isDraggedOutside={draggingItemId === item.id && isDraggedOutside}
          baseSize={scaledButtonSize}
          intentPrefetchAppId={appId}
        />,
      );
    } else {
      const file = item.path ? getFileItem(item.path) : null;
      const isEmojiIcon =
        item.icon &&
        !item.icon.startsWith("/") &&
        !item.icon.startsWith("http") &&
        item.icon.length <= 10;
      const icon = isEmojiIcon ? item.icon! : file?.icon || "📦";
      const label =
        item.name ||
        item.path?.split("/").pop()?.replace(/\.(app|html)$/i, "") ||
        "Applet";

      elements.push(
        <DockIconButton
          key={item.id}
          ref={(el) => {
            if (el) iconRefsMap.current.set(item.id, el);
            else iconRefsMap.current.delete(item.id);
          }}
          label={label}
          icon={icon}
          idKey={item.id}
          isEmoji={
            isEmojiIcon ||
            (!item.icon?.startsWith("/") && !item.icon?.startsWith("http"))
          }
          onClick={(e) => {
            if (item.path) {
              const rect = e.currentTarget.getBoundingClientRect();
              const launchOrigin: LaunchOriginRect = {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              };
              launchApp("applet-viewer", {
                initialData: { path: item.path },
                launchOrigin,
              });
            }
          }}
          mouseX={mouseX}
          magnifyEnabled={effectiveMagnifyEnabled}
          isNew={hasMounted && !seenIdsRef.current.has(item.id)}
          isHovered={hoveredId === item.id}
          isSwapping={isSwapping}
          onHover={() => handleIconHover(item.id)}
          onLeave={handleIconLeave}
          draggable
          onDragStart={(e) => handleItemDragStart(e, item.id, index)}
          onDragEnd={(e) => handleItemDragEnd(e, item.id)}
          onDragOver={(e) => handleItemDragOver(e, index)}
          isDragging={draggingItemId === item.id}
          isDraggedOutside={draggingItemId === item.id && isDraggedOutside}
          baseSize={scaledButtonSize}
          intentPrefetchAppId="applet-viewer"
        />,
      );
    }
  });

  if (externalDragIndex === renderablePinnedItems.length) {
    elements.push(
      <DockSpacer
        key="dock-drop-spacer"
        idKey="dock-drop-spacer"
        mouseX={mouseX}
        magnifyEnabled={effectiveMagnifyEnabled}
        baseSize={scaledButtonSize}
      />,
    );
  }

  return elements;
}
