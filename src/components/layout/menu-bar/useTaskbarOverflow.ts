import { useState, useEffect, useRef, useMemo } from "react";
import type { AppInstance } from "@/stores/useAppStore";

export function useTaskbarOverflow(
  instances: Record<string, AppInstance>,
  enabled: boolean
) {
  const runningAreaRef = useRef<HTMLDivElement>(null);
  const [visibleTaskbarIds, setVisibleTaskbarIds] = useState<string[]>([]);
  const [overflowTaskbarIds, setOverflowTaskbarIds] = useState<string[]>([]);

  const allTaskbarIds = useMemo(() => {
    return Object.values(instances)
      .filter((i) => i.isOpen)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((i) => i.instanceId);
  }, [instances]);

  useEffect(() => {
    if (!enabled) {
      setVisibleTaskbarIds([]);
      setOverflowTaskbarIds([]);
      return;
    }

    const container = runningAreaRef.current;
    if (!container) return;

    const MIN_WIDTH = 110;
    const GAP = 2;
    const BUTTON_TOTAL_MIN = MIN_WIDTH + GAP;
    const MORE_BTN_WIDTH = 40;

    const compute = () => {
      const containerWidth = container.clientWidth;
      const countWithoutMore = Math.max(
        0,
        Math.floor(containerWidth / BUTTON_TOTAL_MIN)
      );
      if (allTaskbarIds.length <= countWithoutMore) {
        setVisibleTaskbarIds(allTaskbarIds);
        setOverflowTaskbarIds([]);
        return;
      }
      const countWithMore = Math.max(
        1,
        Math.floor((containerWidth - MORE_BTN_WIDTH) / BUTTON_TOTAL_MIN)
      );
      setVisibleTaskbarIds(allTaskbarIds.slice(0, countWithMore));
      setOverflowTaskbarIds(allTaskbarIds.slice(countWithMore));
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(container);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [enabled, allTaskbarIds]);

  return {
    runningAreaRef,
    visibleTaskbarIds,
    overflowTaskbarIds,
    allTaskbarIds,
  };
}
