import { useRef, useImperativeHandle, forwardRef } from "react";

export interface DashboardRippleRef {
  triggerRipple: (x: number, y: number) => void;
}

const DURATION = 2000;
const RING_COUNT = 5;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function spawnRipple(container: HTMLDivElement, cx: number, cy: number) {
  const maxD = Math.max(window.innerWidth, window.innerHeight) * 1.8;
  const rings: HTMLDivElement[] = [];

  // Bright flash at drop point
  const flash = document.createElement("div");
  Object.assign(flash.style, {
    position: "absolute",
    left: `${cx}px`,
    top: `${cy}px`,
    width: "0px",
    height: "0px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  });
  container.appendChild(flash);

  for (let i = 0; i < RING_COUNT; i++) {
    const ring = document.createElement("div");
    const isBright = i % 2 === 0;
    Object.assign(ring.style, {
      position: "absolute",
      left: `${cx - maxD / 2}px`,
      top: `${cy - maxD / 2}px`,
      width: `${maxD}px`,
      height: `${maxD}px`,
      borderRadius: "50%",
      border: isBright
        ? "2px solid rgba(255,255,255,0.5)"
        : "1.5px solid rgba(0,0,0,0.18)",
      boxShadow: isBright
        ? "0 0 12px 2px rgba(255,255,255,0.1), inset 0 0 12px 2px rgba(255,255,255,0.06)"
        : "none",
      transform: "scale(0)",
      opacity: "0",
      pointerEvents: "none",
    });
    container.appendChild(ring);
    rings.push(ring);
  }

  const start = performance.now();

  function tick() {
    const elapsed = performance.now() - start;
    const t = Math.min(elapsed / DURATION, 1);

    // Flash animation (first 200ms)
    const flashT = Math.min(elapsed / 200, 1);
    const flashSize = flashT * 140;
    flash.style.width = `${flashSize}px`;
    flash.style.height = `${flashSize}px`;
    flash.style.opacity = String(Math.max(0, 1 - flashT));

    // Ring animations
    for (let i = 0; i < rings.length; i++) {
      const delay = i * 0.03;
      const ringT = Math.max(0, Math.min((t - delay) / (1 - delay), 1));
      const scale = easeOutCubic(ringT);
      const fadeStart = 0.15;
      const fadeT = Math.max(0, (ringT - fadeStart) / (1 - fadeStart));
      const baseOpacity = 0.65 - i * 0.08;
      const opacity = baseOpacity * (1 - fadeT * fadeT);

      rings[i].style.transform = `scale(${scale})`;
      rings[i].style.opacity = String(Math.max(0, opacity));
    }

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      flash.remove();
      for (const r of rings) r.remove();
    }
  }

  requestAnimationFrame(tick);
}

const DashboardRippleInner = (
  _props: object,
  ref: React.Ref<DashboardRippleRef>
) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      triggerRipple(x: number, y: number) {
        if (containerRef.current) {
          spawnRipple(containerRef.current, x, y);
        }
      },
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
};

export const DashboardRipple = forwardRef(DashboardRippleInner);
