import React, { useCallback, useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import {
  DOCK_BASE_BUTTON_SIZE,
  DOCK_MAGNIFY_DISTANCE,
  DOCK_MAX_SCALE,
} from "./dockConstants";
import type { DockSpacerProps } from "./dockTypes";

export function DockSpacer({
  ref,
  idKey,
  mouseX,
  magnifyEnabled,
  baseSize: baseSizeProp,
}: DockSpacerProps & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const baseSize = baseSizeProp ?? DOCK_BASE_BUTTON_SIZE;
  const maxSize = Math.round(baseSize * DOCK_MAX_SCALE);

  const targetSize = useMotionValue(baseSize);

  useEffect(() => {
    if (!magnifyEnabled) {
      targetSize.set(baseSize);
    }
  }, [baseSize, magnifyEnabled, targetSize]);

  const distanceCalc = useTransform(mouseX, (val) => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds || !Number.isFinite(val)) return Infinity;
    return val - (bounds.left + bounds.width / 2);
  });

  useEffect(() => {
    if (!magnifyEnabled) return;

    const unsubscribe = distanceCalc.on("change", (dist) => {
      if (!Number.isFinite(dist)) {
        targetSize.set(baseSize);
        return;
      }
      const absDist = Math.abs(dist);
      if (absDist > DOCK_MAGNIFY_DISTANCE) {
        targetSize.set(baseSize);
      } else {
        const t = 1 - absDist / DOCK_MAGNIFY_DISTANCE;
        targetSize.set(baseSize + t * (maxSize - baseSize));
      }
    });

    return unsubscribe;
  }, [magnifyEnabled, baseSize, maxSize, distanceCalc, targetSize]);

  const sizeSpring = useSpring(targetSize, {
    mass: 0.15,
    stiffness: 160,
    damping: 18,
  });

  const widthValue = sizeSpring;

  const setCombinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      wrapperRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref && "current" in (ref as object)) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  return (
    <motion.div
      ref={setCombinedRef}
      layout
      layoutId={`dock-spacer-${idKey}`}
      initial={{ width: 0, height: 0 }}
      animate={{ width: baseSize + 8, height: baseSize }}
      exit={{ width: 0, height: 0 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30,
      }}
      className="flex-shrink-0"
      style={{
        width: widthValue,
        height: widthValue,
        marginLeft: 4,
        marginRight: 4,
        transformOrigin: "bottom center",
      }}
    />
  );
}
