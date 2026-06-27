import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import {
  CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT,
  CONTROL_PANELS_MAC_MIN_WINDOW_HEIGHT,
  CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT,
  CONTROL_PANELS_MAC_SIZE_TRANSITION,
} from "./controlPanelsMacMotion";

export type ControlPanelsMacAnimatedBodyProps = {
  instanceId?: string;
  toolbarHeight: number;
  /**
   * Title-bar height for the current theme (Aqua's 24px notitlebar spacer by
   * default). Used to convert the measured content height into a total window
   * height when auto-resizing.
   */
  titlebarHeight?: number;
  /** In-window menu-bar height, present on Windows themes. */
  menubarHeight?: number;
  /** Changes when Show All ↔ pane navigation occurs (drives re-measure). */
  navKey: string;
  children: ReactNode;
  className?: string;
};

export function ControlPanelsMacAnimatedBody({
  instanceId,
  toolbarHeight,
  titlebarHeight = CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT,
  menubarHeight = 0,
  navKey,
  children,
  className,
}: ControlPanelsMacAnimatedBodyProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const naturalHeightRef = useRef<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(true);
  const lastWindowHeightRef = useRef<number | null>(null);
  const fixedChromeHeight = titlebarHeight + menubarHeight + toolbarHeight;

  const maxBodyHeight = Math.max(
    0,
    CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT - fixedChromeHeight
  );

  const readNaturalHeight = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;

    // The FIRST measure always runs unconstrained: data-scrollable is only set
    // once naturalHeight is known (and isMeasuring is false), so the initial
    // layout-effect measure (and the per-pane re-measure on navKey) reads the
    // true natural content height — the well auto-sizes to the tallest tab.
    //
    // Tabbed panes then scroll INSIDE the active tab panel (pinned tab bar) once
    // capped, which constrains this measure subtree. That can't reopen the old
    // Safari auto-size feedback loop: the high-water guard below freezes the
    // captured natural height, and we never try to recover it from the collapsed
    // inner scroller (the recovery math was what bounced on Safari). Simple panes
    // stay unconstrained — the body itself scrolls — so they measure naturally
    // on every pass.
    //
    // Use offsetHeight (the layout border-box height). A visual rect would also
    // include ancestor transforms, so the window's open/scale animation would
    // corrupt the first measurement (locking in a too-short Show All on initial
    // load, since a transform end fires no ResizeObserver to correct it).
    const next = root.offsetHeight;
    if (next <= 0) return;

    const prev = naturalHeightRef.current;
    // Within a single pane (same navKey) grow to fit, but don't shrink on content
    // swaps like switching tabs — the inactive tab panel is display:none, so the
    // stacked well reports only the active tab's height. Holding the high-water
    // mark keeps the window sized to the tallest tab so swaps don't jitter. The
    // navKey reset (below) re-baselines when navigating to a different pane.
    // Shrinks above the cap are allowed (the window is already maxed there).
    if (prev !== null && next < prev - 1 && next <= maxBodyHeight) return;
    if (prev === next) return;
    naturalHeightRef.current = next;
    setNaturalHeight(next);
  }, [maxBodyHeight]);

  const updateHeight = useCallback(
    (_entry: ResizeObserverEntry) => {
      readNaturalHeight();
    },
    [readNaturalHeight]
  );

  useResizeObserverWithRef(measureRef, updateHeight);

  useLayoutEffect(() => {
    naturalHeightRef.current = null;
    setNaturalHeight(null);
    setIsMeasuring(true);
    lastWindowHeightRef.current = null;
  }, [navKey]);

  useLayoutEffect(() => {
    if (!isMeasuring) return;
    readNaturalHeight();
    setIsMeasuring(false);
  }, [isMeasuring, readNaturalHeight, navKey]);

  const animatedHeight =
    naturalHeight === null ? undefined : Math.min(naturalHeight, maxBodyHeight);
  const needsScroll =
    !isMeasuring &&
    naturalHeight !== null &&
    naturalHeight > maxBodyHeight;

  // The minimum content area below the toolbar (window floor minus titlebar and
  // toolbar). The window auto-sizes to content but never shrinks below this floor,
  // so when content is short the window keeps the floored height and the body must
  // still fill it — otherwise a bare pinstripe band shows below the grid/pane (and,
  // while searching, below the spotlight scrim). CSS applies this as a `min-height`
  // on the BODY (so the light-mode content tint fills the full floored window) and,
  // while searching, as the floor on the grid so the scrim stretches to cover the
  // same area. Derived from the *constant* window floor + measured toolbar height
  // (never the measured content height), so it can't feed back into the auto-height
  // measure loop — the floor lives on the body, the parent of the measured node.
  const bodyFillMinHeight = Math.max(
    0,
    CONTROL_PANELS_MAC_MIN_WINDOW_HEIGHT - fixedChromeHeight
  );

  useLayoutEffect(() => {
    if (!instanceId || animatedHeight === undefined) return;

    // Respect the window's min/max height: never auto-shrink below the configured
    // minimum (matches windowConstraints.minHeight) even when content is short.
    const totalWindowHeight = Math.max(
      CONTROL_PANELS_MAC_MIN_WINDOW_HEIGHT,
      Math.min(
        CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT,
        fixedChromeHeight + animatedHeight
      )
    );

    if (lastWindowHeightRef.current === totalWindowHeight) return;
    lastWindowHeightRef.current = totalWindowHeight;

    const { instances, updateInstanceWindowState } = useAppStore.getState();
    const instance = instances[instanceId];
    if (!instance) return;

    updateInstanceWindowState(
      instanceId,
      instance.position ?? { x: 100, y: 100 },
      {
        width: instance.size?.width ?? 440,
        height: totalWindowHeight,
      }
    );
  }, [instanceId, animatedHeight, fixedChromeHeight]);

  return (
    <motion.div
      className={cn("control-panels-mac-body shrink-0 overflow-hidden", className)}
      data-scrollable={needsScroll ? true : undefined}
      style={
        {
          "--control-panels-mac-body-fill-min-height": bodyFillMinHeight
            ? `${bodyFillMinHeight}px`
            : undefined,
        } as CSSProperties
      }
      initial={false}
      animate={
        animatedHeight === undefined ? undefined : { height: animatedHeight }
      }
      transition={CONTROL_PANELS_MAC_SIZE_TRANSITION}
    >
      <div ref={measureRef} className="control-panels-mac-body-measure">
        <div className="control-panels-mac-body-layout">{children}</div>
      </div>
    </motion.div>
  );
}
