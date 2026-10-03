import { useSyncExternalStore } from "react";
import { subscribeDesktopContentBounds } from "@/utils/desktopContentBounds";
import {
  BOTTOM_DOCK_LAYOUT,
  type DockLayout,
  getDockLayout,
} from "@/components/layout/dock/dockPlacement";

const getServerSnapshot = () => BOTTOM_DOCK_LAYOUT;

/** Dock placement for the current content insets. Re-renders only when it changes. */
export function useDockLayout(): DockLayout {
  return useSyncExternalStore(
    subscribeDesktopContentBounds,
    getDockLayout,
    getServerSnapshot,
  );
}
