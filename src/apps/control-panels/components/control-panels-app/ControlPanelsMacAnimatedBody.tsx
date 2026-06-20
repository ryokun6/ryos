import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
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

const CONTENT_MEASURE_SELECTOR =
  ".control-panels-category-grid, .control-panels-mac-pane";

export type ControlPanelsMacAnimatedBodyProps = {
  instanceId?: string;
  toolbarHeight: number;
  /** Changes when Show All ↔ pane navigation occurs (drives re-measure). */
  navKey: string;
  children: ReactNode;
  className?: string;
};

export function ControlPanelsMacAnimatedBody({
  instanceId,
  toolbarHeight,
  navKey,
  children,
  className,
}: ControlPanelsMacAnimatedBodyProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const naturalHeightRef = useRef<number | null>(null);
  const [naturalHeight, setNaturalHeight] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(true);
  const lastWindowHeightRef = useRef<number | null>(null);

  const maxBodyHeight = Math.max(
    0,
    CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT -
      CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT -
      toolbarHeight
  );

  const readNaturalHeight = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;

    // Measure unconstrained content roots so scroll-constrained flex layout cannot
    // collapse scrollHeight and toggle data-scrollable (height flicker).
    const content =
      root.querySelector<HTMLElement>(CONTENT_MEASURE_SELECTOR) ?? root;
    // WebKit/Safari underreports the natural height of flex content in ways the
    // height-capped body then clips (so padding/rows look missing on Safari but
    // fine on Chrome):
    //  1. scrollHeight omits the flex pane's bottom padding.
    //  2. flex-constrained inner scrollers (tabbed pref panels with overflow-y:auto)
    //     collapse below their content in auto-height mode, hiding overflow that
    //     Chrome would expand to fit.
    // Defenses: take the largest of several height signals. getBoundingClientRect
    // reflects the true rendered box, and `root` (the measure wrapper) is a plain
    // block in auto-height mode whose scrollHeight reliably includes descendant
    // padding on every engine; scrollHeight of the flex pane still wins in the
    // height-capped/scrollable state where `root` is itself flex-constrained. On
    // Chrome these are all equal, so this is a no-op there.
    let measured = Math.max(
      content.scrollHeight,
      content.getBoundingClientRect().height,
      root.scrollHeight,
      root.getBoundingClientRect().height
    );

    // Only in auto-height mode (below the cap): add back any content a collapsed
    // inner scroller is hiding. In the capped/scrollable state scrollHeight already
    // reports the full natural height, so skipping avoids double-counting.
    if (measured < maxBodyHeight) {
      let collapsedOverflow = 0;
      content
        .querySelectorAll<HTMLElement>(
          ".control-panels-pref-tab-panel:not([hidden])"
        )
        .forEach((p) => {
          collapsedOverflow = Math.max(
            collapsedOverflow,
            p.scrollHeight - p.clientHeight
          );
        });
      measured += collapsedOverflow;
    }

    const next = Math.ceil(measured);
    if (next <= 0) return;

    const prev = naturalHeightRef.current;
    if (prev !== null && next < prev - 1 && next <= maxBodyHeight) {
      return;
    }

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

  useLayoutEffect(() => {
    if (!instanceId || animatedHeight === undefined) return;

    // Respect the window's min/max height: never auto-shrink below the configured
    // minimum (matches windowConstraints.minHeight) even when content is short.
    const totalWindowHeight = Math.max(
      CONTROL_PANELS_MAC_MIN_WINDOW_HEIGHT,
      Math.min(
        CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT,
        CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT + toolbarHeight + animatedHeight
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
  }, [instanceId, animatedHeight, toolbarHeight]);

  return (
    <motion.div
      className={cn("control-panels-mac-body shrink-0 overflow-hidden", className)}
      data-scrollable={needsScroll ? true : undefined}
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
