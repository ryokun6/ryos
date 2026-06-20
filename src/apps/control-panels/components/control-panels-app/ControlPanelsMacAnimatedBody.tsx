import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import {
  CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT,
  CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT,
  CONTROL_PANELS_MAC_SIZE_TRANSITION,
} from "./controlPanelsMacMotion";

const CONTENT_MEASURE_SELECTOR =
  ".control-panels-category-grid, .control-panels-mac-pane";

// TEMP DEBUG: on-screen auto-height diagnostics for the macOS Control Panels.
// Enable with `?cp-debug=1` in the URL (easy to set + screenshot on iOS Safari)
// or `localStorage["ryos:debug:cp-autoheight"]="1"`. Remove once the Safari
// bottom-padding/clipping issue is resolved.
function readCpAutoHeightDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.has("cp-debug")) return sp.get("cp-debug") !== "0";
    return localStorage.getItem("ryos:debug:cp-autoheight") === "1";
  } catch {
    return false;
  }
}

type CpAutoHeightDiag = Record<string, number | string | boolean | null>;

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

  // TEMP DEBUG
  const debugEnabled = useRef(readCpAutoHeightDebug()).current;
  const [diag, setDiag] = useState<CpAutoHeightDiag | null>(null);
  const diagKeyRef = useRef("");

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
    const contentSH = content.scrollHeight;
    const contentRH = content.getBoundingClientRect().height;
    const rootSH = root.scrollHeight;
    const rootRH = root.getBoundingClientRect().height;
    let measured = Math.max(contentSH, contentRH, rootSH, rootRH);

    // Only in auto-height mode (below the cap): add back any content a collapsed
    // inner scroller is hiding. In the capped/scrollable state scrollHeight already
    // reports the full natural height, so skipping avoids double-counting.
    let collapsedOverflow = 0;
    let panelSH = 0;
    let panelCH = 0;
    const panel = content.querySelector<HTMLElement>(
      ".control-panels-pref-tab-panel:not([hidden])"
    );
    if (panel) {
      panelSH = panel.scrollHeight;
      panelCH = panel.clientHeight;
    }
    if (measured < maxBodyHeight) {
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

    // TEMP DEBUG: capture every height signal so the on-screen overlay can show
    // exactly which one is short on real iOS Safari.
    if (debugEnabled) {
      const bodyEl = root.parentElement as HTMLElement | null;
      const snapshot: CpAutoHeightDiag = {
        ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
        navKey,
        toolbarH: toolbarHeight,
        maxBodyH: maxBodyHeight,
        contentSH,
        contentRH: Math.round(contentRH),
        rootSH,
        rootRH: Math.round(rootRH),
        tabPanel: panel ? `${panelSH}/${panelCH}` : "—",
        collapsedOverflow,
        measuredNext: next,
        bodyRectH: bodyEl ? Math.round(bodyEl.getBoundingClientRect().height) : null,
        dpr: typeof window !== "undefined" ? window.devicePixelRatio : null,
      };
      const key = JSON.stringify(snapshot);
      if (key !== diagKeyRef.current) {
        diagKeyRef.current = key;
        setDiag(snapshot);
      }
    }

    const prev = naturalHeightRef.current;
    if (prev !== null && next < prev - 1 && next <= maxBodyHeight) {
      return;
    }

    if (prev === next) return;
    naturalHeightRef.current = next;
    setNaturalHeight(next);
  }, [maxBodyHeight, debugEnabled, navKey, toolbarHeight]);

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

  // TEMP DEBUG: poll the post-layout/animated state — bodyRectH is the final
  // clipped height; clippedPad > 0 means the pane bottom padding is being cut.
  const [live, setLive] = useState<CpAutoHeightDiag | null>(null);
  useEffect(() => {
    if (!debugEnabled) return;
    const id = window.setInterval(() => {
      const root = measureRef.current;
      const bodyEl = root?.parentElement as HTMLElement | null;
      const inner = root?.querySelector<HTMLElement>(
        ".control-panels-mac-pane-inner"
      );
      const winSize = instanceId
        ? useAppStore.getState().instances[instanceId]?.size
        : undefined;
      const bodyBottom = bodyEl
        ? bodyEl.getBoundingClientRect().bottom
        : null;
      const innerBottom = inner ? inner.getBoundingClientRect().bottom : null;
      setLive({
        bodyRectH: bodyEl
          ? Math.round(bodyEl.getBoundingClientRect().height)
          : null,
        clippedPad:
          innerBottom != null && bodyBottom != null
            ? Math.max(0, Math.round(innerBottom - bodyBottom))
            : null,
        winH: winSize?.height ?? null,
        naturalH: naturalHeightRef.current,
        animatedH: animatedHeight ?? null,
        scroll: needsScroll,
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [debugEnabled, instanceId, animatedHeight, needsScroll]);

  useLayoutEffect(() => {
    if (!instanceId || animatedHeight === undefined) return;

    const totalWindowHeight = Math.min(
      CONTROL_PANELS_MAC_MAX_WINDOW_HEIGHT,
      CONTROL_PANELS_MACOSX_TITLEBAR_HEIGHT + toolbarHeight + animatedHeight
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
      {debugEnabled ? (
        <CpAutoHeightDebugOverlay diag={diag} live={live} />
      ) : null}
    </motion.div>
  );
}

// TEMP DEBUG: portal overlay rendered to <body> so overflow:hidden ancestors
// cannot clip it. Shows the raw measurement signals + the post-layout state.
function CpAutoHeightDebugOverlay({
  diag,
  live,
}: {
  diag: CpAutoHeightDiag | null;
  live: CpAutoHeightDiag | null;
}) {
  if (typeof document === "undefined") return null;
  const rows: Array<[string, CpAutoHeightDiag | null]> = [
    ["measure", diag],
    ["live", live],
  ];
  return createPortal(
    <div
      style={{
        position: "fixed",
        left: 6,
        bottom: 6,
        zIndex: 2147483647,
        maxWidth: "min(92vw, 360px)",
        padding: "6px 8px",
        background: "rgba(0,0,0,0.82)",
        color: "#0f0",
        font: "10px/1.35 ui-monospace, Menlo, monospace",
        borderRadius: 6,
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      <div style={{ color: "#ff0", fontWeight: 700 }}>CP auto-height debug</div>
      {rows.map(([label, data]) => (
        <div key={label} style={{ marginTop: 3 }}>
          <span style={{ color: "#0ff" }}>{label}:</span>{" "}
          {data
            ? Object.entries(data)
                .filter(([k]) => k !== "ua")
                .map(([k, v]) => `${k}=${v}`)
                .join("  ")
            : "—"}
        </div>
      ))}
    </div>,
    document.body
  );
}
