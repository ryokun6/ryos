import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/** Total durations for the one-shot CRT animations, in ms. Kept in one
 *  place so completion timers, exit fades, and inner timings stay in
 *  sync. */
const POWER_ON_DURATION_MS = 800;
const POWER_OFF_DURATION_MS = 600;
const CHANNEL_SWITCH_DURATION_MS = 550;
/** How long the screen stays fully black at the start of the power-on
 *  before the picture begins unfolding. Gives a clean handoff from the
 *  paused "screen-off" overlay (or the bare iframe on first open) so the
 *  unfold visually reads as "the tube warming up". */
const POWER_ON_HOLD_MS = 90;

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
 * One-shot CRT power-on animation. Two black bars cover the picture
 * (top half + bottom half); after a brief fully-black hold they recede
 * toward the top and bottom edges, leaving a transparent band that
 * grows outward from a thin horizontal beam at the vertical center.
 * That's the classic CRT "tube warming up" reveal. A bright scanline
 * beam pops across the middle as the bars start receding, and a quick
 * white flash fades the whole thing into the picture.
 *
 * The component auto-unmounts itself after the animation completes
 * (timer-driven) so it never leaves a `bg-black` overlay sitting on
 * top of the iframe.
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

  const holdSec = POWER_ON_HOLD_MS / 1000;
  const unfoldSec = 0.55;
  const barTransition = {
    duration: unfoldSec,
    delay: holdSec,
    ease: [0.16, 1, 0.3, 1] as const,
  };

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
          {/* Top half black bar — full black for POWER_ON_HOLD_MS, then
              recedes toward the top edge. Together with the bottom bar
              this makes the transparent band at the vertical center
              grow outward, revealing the picture from a beam. */}
          <motion.div
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={barTransition}
            className="absolute left-0 right-0 top-0 bg-black"
            style={{ height: "50%", transformOrigin: "top center" }}
          />
          <motion.div
            initial={{ scaleY: 1 }}
            animate={{ scaleY: 0 }}
            transition={barTransition}
            className="absolute left-0 right-0 bottom-0 bg-black"
            style={{ height: "50%", transformOrigin: "bottom center" }}
          />
          {/* Bright horizontal scanline beam that snaps across the middle
              right as the bars start receding. */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: [0, 1, 0] }}
            transition={{
              scaleX: { duration: 0.18, delay: holdSec, ease: "easeOut" },
              opacity: {
                duration: 0.5,
                delay: holdSec,
                ease: "easeOut",
                times: [0, 0.2, 1],
              },
            }}
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
            style={{
              height: "2px",
              background:
                "linear-gradient(to right, transparent 0%, rgba(255,255,255,1) 50%, transparent 100%)",
              boxShadow:
                "0 0 16px 4px rgba(255,255,255,0.9), 0 0 32px 8px rgba(255,255,255,0.5)",
              transformOrigin: "center",
            }}
          />
          {/* Final brightness pop, timed so it peaks just after the
              picture is fully revealed. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0] }}
            transition={{
              duration: 0.45,
              delay: holdSec + 0.18,
              ease: "easeOut",
              times: [0, 0.25, 1],
            }}
            className="absolute inset-0 bg-white"
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
function PowerOffEffect({
  active,
  onComplete,
}: {
  active: boolean;
  onComplete?: () => void;
}) {
  // Fire onComplete via a real timer rather than AnimatePresence.onExitComplete
  // so it triggers when the animation *finishes playing*, not when the
  // overlay later unmounts. Without this the close handler was never
  // dispatched and the TV window never closed after the squeeze played.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!active) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    const id = window.setTimeout(() => {
      onComplete?.();
    }, POWER_OFF_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="power-off"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.05 }}
          className="absolute inset-0 pointer-events-none z-50 bg-black overflow-hidden"
        >
          {/* Bright vertical squeeze: full → 2px line → 0px (dot). */}
          <motion.div
            initial={{ scaleY: 1, scaleX: 1, opacity: 1 }}
            animate={{
              scaleY: [1, 0.02, 0.02],
              scaleX: [1, 1, 0.0],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.55,
              times: [0, 0.45, 1],
              ease: "easeIn",
            }}
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, rgba(220,220,255,0.6) 30%, rgba(120,140,180,0.2) 60%, transparent 100%)",
              transformOrigin: "center",
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
