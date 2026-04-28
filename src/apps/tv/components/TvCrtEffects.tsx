import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/** Total durations for the one-shot CRT animations, in ms. Kept in one
 *  place so completion timers, exit fades, and inner timings stay in
 *  sync. The power-on/off curves are split into named phases below; if
 *  these change, retune the corresponding `times` arrays. */
const POWER_ON_DURATION_MS = 900;
const POWER_OFF_DURATION_MS = 750;
const CHANNEL_SWITCH_DURATION_MS = 550;

/**
 * Animated analog-static canvas. Used both as a brief "channel-switch"
 * burst and as a sustained "buffering / loading" overlay. Intensity (0..1)
 * controls how aggressively the noise is drawn; alpha (0..1) controls how
 * opaque the canvas is layered on top of the picture.
 *
 * NOTE: rAF-based; the parent should mount/unmount the canvas via
 * AnimatePresence or a conditional so the loop only runs while visible.
 */
function NoiseCanvas({
  intensity = 1,
  className,
  style,
}: {
  intensity?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const intensityRef = useRef(intensity);

  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      // Render at half-res for performance; CSS scales it to full size.
      const w = Math.max(1, Math.floor(canvas.offsetWidth / 2));
      const h = Math.max(1, Math.floor(canvas.offsetHeight / 2));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const draw = () => {
      resize();
      const w = canvas.width;
      const h = canvas.height;
      const img = ctx.createImageData(w, h);
      const data = img.data;
      const k = intensityRef.current;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255 * k;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      // Subtle scanline darkening on every other row.
      for (let y = 0; y < h; y += 2) {
        const rowStart = y * w * 4;
        const rowEnd = rowStart + w * 4;
        for (let i = rowStart; i < rowEnd; i += 4) {
          data[i] *= 0.78;
          data[i + 1] *= 0.78;
          data[i + 2] *= 0.78;
        }
      }
      ctx.putImageData(img, 0, 0);
      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none", className)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}

/**
 * Persistent CRT shader-style overlay: vignette + horizontal scanlines +
 * a faint RGB phosphor mask. Pure CSS gradients so it composites cheaply
 * over the YouTube iframe.
 */
function CrtShaderOverlay({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none z-30"
      style={{
        opacity: active ? 1 : 0,
        transition: "opacity 220ms ease-out",
        // Layered effects:
        //  1. Horizontal scanlines (1px on / 2px off)
        //  2. RGB phosphor mask (vertical R/G/B subpixel stripes)
        //  3. Soft corner vignette
        backgroundImage: [
          "repeating-linear-gradient(to bottom, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)",
          "repeating-linear-gradient(to right, rgba(255,0,0,0.04) 0px, rgba(255,0,0,0.04) 1px, rgba(0,255,0,0.04) 1px, rgba(0,255,0,0.04) 2px, rgba(0,0,255,0.04) 2px, rgba(0,0,255,0.04) 3px)",
          "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)",
        ].join(", "),
        mixBlendMode: "multiply",
      }}
    />
  );
}

/**
 * One-shot CRT power-on animation, modeled on a real cathode-ray tube
 * warming up:
 *
 *   1. Hold full black while the heater warms.
 *   2. A tiny phosphor dot appears at the exact vertical/horizontal
 *      center of the screen and brightens.
 *   3. The dot stretches horizontally into a thin bright scanline.
 *   4. The two black bars covering the top and bottom recede toward
 *      their respective outer edges, revealing the picture growing
 *      outward from the center beam.
 *   5. A subtle white wash flashes (screen-blend) as the picture
 *      settles into full brightness.
 *
 * The component auto-unmounts via a timer once the animation completes
 * so it never leaves a black overlay parked on top of the iframe.
 */
function PowerOnEffect({ playKey }: { playKey: number }) {
  const [activeKey, setActiveKey] = useState(0);

  useEffect(() => {
    if (playKey <= 0) return;
    setActiveKey(playKey);
    const id = window.setTimeout(
      () => setActiveKey(0),
      POWER_ON_DURATION_MS
    );
    return () => window.clearTimeout(id);
  }, [playKey]);

  // All keyframe `times` are normalized to this total duration so the
  // beats stay coordinated even if POWER_ON_DURATION_MS is retuned.
  const totalSec = POWER_ON_DURATION_MS / 1000;
  // Phase milestones (as fractions of totalSec):
  //   0.00 .. 0.32  bars hold full black (heater warming, dot brightens)
  //   0.32 .. 0.82  bars recede; beam peaks then fades
  //   0.55 .. 0.95  brightness flash settling into the picture

  return (
    <AnimatePresence>
      {activeKey > 0 && (
        <motion.div
          key={activeKey}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="absolute inset-0 pointer-events-none z-40 overflow-hidden"
        >
          {/* Top half black bar — fully covers initially, holds, then
              recedes toward the top edge. transform-origin: top means
              scaleY 0 leaves the bar pinned to the top edge with zero
              height, so the picture appears to grow downward from a
              center beam (mirrored by the bottom bar). */}
          <motion.div
            initial={{ scaleY: 1 }}
            animate={{ scaleY: [1, 1, 0] }}
            transition={{
              duration: totalSec,
              times: [0, 0.32, 0.82],
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute left-0 right-0 top-0 bg-black"
            style={{ height: "50%", transformOrigin: "top center" }}
          />
          <motion.div
            initial={{ scaleY: 1 }}
            animate={{ scaleY: [1, 1, 0] }}
            transition={{
              duration: totalSec,
              times: [0, 0.32, 0.82],
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute left-0 right-0 bottom-0 bg-black"
            style={{ height: "50%", transformOrigin: "bottom center" }}
          />

          {/* Phosphor warm-up dot at center: appears during the black
              hold, brightens, then expands and fades as the beam takes
              over. Stays visible above the bars (later in DOM order). */}
          <motion.div
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{
              opacity: [0, 0.4, 1, 1, 0],
              scale: [0.2, 0.4, 0.7, 1.0, 2.6],
            }}
            transition={{
              duration: totalSec,
              times: [0, 0.12, 0.24, 0.42, 0.72],
              ease: "easeOut",
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 8,
              height: 8,
              background:
                "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(220,235,255,0.7) 40%, rgba(180,210,255,0.25) 70%, transparent 100%)",
              boxShadow:
                "0 0 24px 8px rgba(255,255,255,0.6), 0 0 56px 18px rgba(180,210,255,0.3)",
            }}
          />

          {/* Horizontal scanline beam stretches out from the dot, peaks
              just as the bars start to recede, then fades into the
              picture. */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{
              scaleX: [0, 0, 1, 1, 1],
              opacity: [0, 0, 1, 0.6, 0],
            }}
            transition={{
              duration: totalSec,
              times: [0, 0.2, 0.42, 0.7, 0.92],
              ease: [0.16, 1, 0.3, 1],
            }}
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
            style={{
              height: "2px",
              background:
                "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.95) 50%, transparent 100%)",
              boxShadow:
                "0 0 14px 3px rgba(255,255,255,0.85), 0 0 32px 8px rgba(255,255,255,0.4)",
              transformOrigin: "center",
            }}
          />

          {/* Brightness wash that peaks just after the picture is fully
              revealed, then fades. mix-blend-mode: screen so it brightens
              the picture rather than washing it out. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0.5, 0] }}
            transition={{
              duration: totalSec,
              times: [0, 0.55, 0.72, 0.95],
              ease: "easeOut",
            }}
            className="absolute inset-0 bg-white"
            style={{ mixBlendMode: "screen" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * One-shot CRT power-off animation: picture squeezes vertically into a
 * bright horizontal line, then collapses to a center dot and fades. Used
 * when the user closes the TV window. The component renders an absolute
 * black overlay with a single white "dying-tube" shape inside.
 */
/**
 * One-shot CRT power-off animation, modeled on a real flyback shutdown:
 *
 *   1. Top + bottom black bars close inward from the outer edges,
 *      squeezing the picture into a thin horizontal slit at center.
 *   2. A bright scanline beam pops at the slit (the electron beam
 *      compressed onto a single line) and holds briefly.
 *   3. The beam collapses horizontally toward the center as the slit
 *      shortens, while a black fill takes over the rest of the screen.
 *   4. The remaining bright dot lingers, then fades with a soft bloom
 *      halo as the phosphors cool.
 *
 * Used both for closing the window (poweringOff) and for pause
 * (screenOff) — in the pause case the final keyframes leave a fully
 * black screen parked indefinitely.
 */
function PowerOffEffect({
  active,
  onComplete,
}: {
  active: boolean;
  onComplete?: () => void;
}) {
  // Fire onComplete via a real timer rather than AnimatePresence.onExitComplete
  // so it triggers when the animation *finishes playing*, not when the
  // overlay later unmounts.
  //
  // Pin onComplete in a ref so re-renders that change the callback
  // identity don't reset the timer. Callers typically pass an inline
  // closure (recreated on every parent render); without this ref, the
  // [active, onComplete] dependency cycle would clear the pending
  // timeout on every re-render and the close event would never fire.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Boolean dep handles the pause → close transition: while paused,
  // active is true but onComplete is undefined (no timer wanted); when
  // the user then clicks close, hasOnComplete flips true and a fresh
  // timer is scheduled.
  const hasOnComplete = Boolean(onComplete);
  useEffect(() => {
    if (!active || !hasOnComplete) return;
    const id = window.setTimeout(() => {
      onCompleteRef.current?.();
    }, POWER_OFF_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [active, hasOnComplete]);

  const totalSec = POWER_OFF_DURATION_MS / 1000;
  // Phase milestones (as fractions of totalSec):
  //   0.00 .. 0.30  bars close in from top/bottom (cubic ease-in)
  //   0.20 .. 0.32  beam fades up at the slit
  //   0.32 .. 0.55  black fill takes over; beam collapses to a dot
  //   0.55 .. 1.00  dot fades with bloom halo

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="power-off"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className="absolute inset-0 pointer-events-none z-50 overflow-hidden"
        >
          {/* Top + bottom black bars close in from the outer edges with
              a steep cubic ease-in so the squeeze accelerates the way a
              real flyback collapse does. scaleY animates to 1 (full
              coverage); the small overshoot via 0.99 → 1 is what gives
              the slit a brief moment to be visible before fully
              closing. */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: [0, 0.99, 1] }}
            transition={{
              duration: totalSec,
              times: [0, 0.3, 0.55],
              ease: [0.5, 0, 0.75, 0.5],
            }}
            className="absolute top-0 left-0 right-0 bg-black"
            style={{ height: "50%", transformOrigin: "top center" }}
          />
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: [0, 0.99, 1] }}
            transition={{
              duration: totalSec,
              times: [0, 0.3, 0.55],
              ease: [0.5, 0, 0.75, 0.5],
            }}
            className="absolute bottom-0 left-0 right-0 bg-black"
            style={{ height: "50%", transformOrigin: "bottom center" }}
          />

          {/* Black background fills the rest of the screen once the
              bars are nearly closed, so the beam + dot below have
              something to glow against. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1] }}
            transition={{
              duration: totalSec,
              times: [0, 0.4, 0.55],
              ease: "linear",
            }}
            className="absolute inset-0 bg-black"
          />

          {/* Bright horizontal beam at the slit. scaleX 1 while the
              slit is still open, then 1 → 0 as the slit collapses
              toward the center, mimicking the electron beam compressed
              into a single line and then a point. */}
          <motion.div
            initial={{ opacity: 0, scaleX: 1 }}
            animate={{
              opacity: [0, 0, 1, 1, 0],
              scaleX: [1, 1, 1, 0.04, 0],
            }}
            transition={{
              duration: totalSec,
              times: [0, 0.2, 0.32, 0.6, 0.72],
              ease: [0.6, 0, 0.4, 1],
            }}
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
            style={{
              height: "3px",
              background:
                "linear-gradient(to right, transparent 0%, rgba(255,255,255,1) 50%, transparent 100%)",
              boxShadow:
                "0 0 18px 5px rgba(255,255,255,0.95), 0 0 40px 12px rgba(255,255,255,0.5)",
              transformOrigin: "center",
            }}
          />

          {/* Center afterglow dot. Appears just as the beam collapses,
              shrinks slightly, and fades — the way phosphor cools after
              the beam shuts off. */}
          <motion.div
            initial={{ opacity: 0, scale: 1 }}
            animate={{
              opacity: [0, 0, 1, 1, 0],
              scale: [1, 1, 1, 0.55, 0.25],
            }}
            transition={{
              duration: totalSec,
              times: [0, 0.55, 0.62, 0.72, 1],
              ease: "easeOut",
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 16,
              height: 16,
              background:
                "radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(220,235,255,0.6) 40%, rgba(180,210,255,0.2) 70%, transparent 100%)",
              boxShadow:
                "0 0 36px 14px rgba(255,255,255,0.8), 0 0 78px 28px rgba(180,210,255,0.4)",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface TvCrtEffectsProps {
  /** Bumped to play a power-on animation. 0 means no animation has played yet. */
  powerOnKey: number;
  /** While true, runs the power-off animation. Caller should set it true
   *  shortly before the window actually closes. */
  poweringOff: boolean;
  onPowerOffComplete?: () => void;
  /** While true, plays the power-off squeeze and then holds a permanent
   *  black "screen off" overlay until set back to false. Used for pause. */
  screenOff?: boolean;
  /** Bumped to play a brief channel-change static burst. */
  channelSwitchKey: number;
  /** Whether the player is currently buffering / loading. Drives a
   *  sustained light static overlay. */
  buffering: boolean;
  /** Whether the persistent CRT scanline / vignette overlay is on. */
  crtActive: boolean;
}

/**
 * Combined CRT / shader effects layer for the TV app. Render this as an
 * absolutely-positioned sibling of the YouTube player so it overlays the
 * picture without affecting layout.
 */
export function TvCrtEffects({
  powerOnKey,
  poweringOff,
  onPowerOffComplete,
  screenOff = false,
  channelSwitchKey,
  buffering,
  crtActive,
}: TvCrtEffectsProps) {
  // Auto-unmount the channel-switch burst once its animation has played.
  // We can't gate on `channelSwitchKey > 0` alone because the prop never
  // resets — that would leave the noise canvas running rAF forever and
  // would also keep an invisible overlay layered on top of the iframe.
  const [activeChannelKey, setActiveChannelKey] = useState(0);
  useEffect(() => {
    if (channelSwitchKey <= 0) return;
    setActiveChannelKey(channelSwitchKey);
    const id = window.setTimeout(
      () => setActiveChannelKey(0),
      CHANNEL_SWITCH_DURATION_MS
    );
    return () => window.clearTimeout(id);
  }, [channelSwitchKey]);

  return (
    <>
      <CrtShaderOverlay active={crtActive} />

      {/* Sustained buffering static — soft, lower opacity. */}
      <AnimatePresence>
        {buffering && (
          <motion.div
            key="tv-buffering"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-30 pointer-events-none"
          >
            <NoiseCanvas intensity={0.85} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Channel-switch burst — brief, full opacity. Re-keys on every
          channel change so a new burst plays even mid-fade. */}
      <AnimatePresence>
        {activeChannelKey > 0 && (
          <motion.div
            key={`tv-channel-${activeChannelKey}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{
              duration: 0.5,
              times: [0, 0.55, 1],
              ease: "easeOut",
            }}
            className="absolute inset-0 z-40 pointer-events-none"
          >
            <NoiseCanvas intensity={1} />
            {/* Quick horizontal tear / RGB shift band sweeping through. */}
            <motion.div
              initial={{ y: "-20%" }}
              animate={{ y: "120%" }}
              transition={{ duration: 0.45, ease: "easeIn" }}
              className="absolute left-0 right-0"
              style={{
                height: "18%",
                background:
                  "linear-gradient(to bottom, transparent 0%, rgba(255,0,80,0.25) 30%, rgba(0,200,255,0.25) 70%, transparent 100%)",
                mixBlendMode: "screen",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <PowerOnEffect playKey={powerOnKey} />
      <PowerOffEffect
        active={poweringOff || screenOff}
        // Only fire onComplete for the close path; pause leaves the
        // black overlay parked indefinitely until the user resumes.
        onComplete={poweringOff ? onPowerOffComplete : undefined}
      />
    </>
  );
}
