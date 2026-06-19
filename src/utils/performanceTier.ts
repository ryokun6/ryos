/**
 * Unified shader-performance classification.
 *
 * A single 3-tier signal replaces the two previously independent heuristics
 * (the boot-time on/off probe and the per-component "reduced graphics" check):
 *
 * - `"off"`     — only genuinely incapable / really-bad devices: no WebGL at
 *                 all, a single CPU core, or extremely little RAM (≤512MB).
 *                 Everything that can plausibly render a shader lands in
 *                 `"reduced"` instead, so phones and mid-range hardware are NOT
 *                 cut off. Shaders default OFF only here.
 * - `"reduced"` — phones, tablets, and low-/mid-performance PCs. Shaders run in
 *                 their reduced-quality tier (lower internal resolution / frame
 *                 rate / backing-buffer size).
 * - `"full"`    — performance desktops/laptops (non-touch, plenty of cores, and
 *                 strong GPU limits). Shaders run at full quality.
 *
 * Hardware capabilities are probed once (a temporary WebGL context) and cached
 * for the session; only the touch/pointer "mobile" signal is re-evaluated per
 * call so the reactive {@link usePerformanceTier} hook can respond to changes.
 */
export type PerformanceTier = "off" | "reduced" | "full";

// "off" is intentionally a very small set — only genuinely unusable hardware.
// Quality signals that used to force "off" (high-precision floats, max texture
// size) now only gate the full-vs-reduced decision, so capable-but-modest
// devices (phones, tablets, budget laptops) get reduced-quality shaders rather
// than nothing.

/** A device with at most this many CPU cores is treated as really bad (→ off). */
const OFF_MAX_CORES = 1;
/** Device memory (GB) at/below this is treated as really bad (→ off). */
const OFF_MAX_MEMORY_GB = 0.5;

/** Non-mobile devices need at least this many cores for the full tier. */
const FULL_MIN_CORES = 8;
/** Full tier requires anisotropic filtering support at least this high. */
const FULL_MIN_ANISOTROPY = 8;
/** Full tier requires a max texture size at least this large. */
const FULL_MIN_TEXTURE_SIZE = 8192;

interface HardwareCapabilities {
  webglSupported: boolean;
  cores: number;
  /** `navigator.deviceMemory` in GB, or `null` when the UA doesn't expose it. */
  memory: number | null;
  maxAnisotropy: number;
  maxTextureSize: number;
  highpSupported: boolean;
}

let cachedCapabilities: HardwareCapabilities | null = null;

/**
 * Probe GPU/CPU capabilities once and cache the result. Implemented with the
 * raw WebGL API (not three.js) so it can run on the critical boot path without
 * pulling the large three chunk into the entry bundle.
 */
function getHardwareCapabilities(): HardwareCapabilities {
  if (cachedCapabilities !== null) return cachedCapabilities;

  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0;
  const memory =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ??
        null
      : null;

  let webglSupported = false;
  let maxAnisotropy = 0;
  let maxTextureSize = 0;
  let highpSupported = false;

  if (typeof document !== "undefined") {
    let canvas: HTMLCanvasElement | null = null;
    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    try {
      canvas = document.createElement("canvas");
      const attributes: WebGLContextAttributes = {
        powerPreference: "high-performance",
      };
      gl =
        canvas.getContext("webgl2", attributes) ||
        canvas.getContext("webgl", attributes);

      if (gl) {
        webglSupported = true;

        const anisotropyExt =
          gl.getExtension("EXT_texture_filter_anisotropic") ||
          gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") ||
          gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
        maxAnisotropy = anisotropyExt
          ? (gl.getParameter(
              anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT
            ) as number)
          : 0;

        maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

        const vertexHighp = gl.getShaderPrecisionFormat(
          gl.VERTEX_SHADER,
          gl.HIGH_FLOAT
        );
        const fragmentHighp = gl.getShaderPrecisionFormat(
          gl.FRAGMENT_SHADER,
          gl.HIGH_FLOAT
        );
        highpSupported =
          (vertexHighp?.precision ?? 0) > 0 &&
          (fragmentHighp?.precision ?? 0) > 0;
      }
    } catch (error) {
      console.error("[PerformanceTier] Error probing WebGL:", error);
      webglSupported = false;
    } finally {
      // Release the temporary context so it doesn't count against the
      // browser's active-context limit.
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      canvas?.remove();
    }
  }

  cachedCapabilities = {
    webglSupported,
    cores,
    memory,
    maxAnisotropy,
    maxTextureSize,
    highpSupported,
  };
  return cachedCapabilities;
}

/**
 * Whether the primary input is touch (phone or tablet). Re-evaluated per call
 * (not cached) so the reactive hook can respond to pointer/resize changes.
 *
 * Uses the primary-pointer media query so touch laptops/2-in-1s with a
 * trackpad (primary pointer = fine) are still eligible for the full tier.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const hasTouch =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return hasTouch && coarsePointer;
}

/**
 * Classify the current device into a {@link PerformanceTier}.
 *
 * Snapshot (non-reactive): safe to call from store initialization on the boot
 * path. Hardware capabilities are cached; the mobile signal is read live.
 */
export function getPerformanceTier(): PerformanceTier {
  // SSR / no DOM: assume a capable client and let it re-resolve after hydration.
  if (typeof navigator === "undefined") return "full";

  const caps = getHardwareCapabilities();

  // --- "off": only genuinely incapable / really-bad devices.
  if (!caps.webglSupported) return "off";
  if (caps.cores > 0 && caps.cores <= OFF_MAX_CORES) return "off";
  if (caps.memory !== null && caps.memory <= OFF_MAX_MEMORY_GB) return "off";

  // --- "full": performance PC — non-mobile with strong CPU + GPU limits.
  const mobile = isMobileDevice();
  if (
    !mobile &&
    caps.cores >= FULL_MIN_CORES &&
    caps.highpSupported &&
    caps.maxAnisotropy >= FULL_MIN_ANISOTROPY &&
    caps.maxTextureSize >= FULL_MIN_TEXTURE_SIZE
  ) {
    return "full";
  }

  // --- "reduced": everything else — phones, tablets, low-/mid-performance PCs.
  return "reduced";
}

/**
 * Test-only: reset the cached capability probe so tests can re-run
 * {@link getPerformanceTier} against different mocked environments.
 */
export function __resetPerformanceTierCacheForTests(): void {
  cachedCapabilities = null;
}
