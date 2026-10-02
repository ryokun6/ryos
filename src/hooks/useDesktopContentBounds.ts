import { useCallback, useSyncExternalStore } from "react";
import {
  type DesktopContentBounds,
  getDesktopContentBounds,
  subscribeDesktopContentBounds,
} from "@/utils/desktopContentBounds";

const SERVER_BOUNDS: DesktopContentBounds = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  right: 0,
  bottom: 0,
};

/** Content rect for layout. Referentially stable until the viewport or inset changes. */
export function useDesktopContentBounds(): DesktopContentBounds {
  const subscribe = useCallback(
    (callback: () => void) => subscribeDesktopContentBounds(callback),
    [],
  );
  const getSnapshot = useCallback(() => getDesktopContentBounds(), []);
  const getServerSnapshot = useCallback(() => SERVER_BOUNDS, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
