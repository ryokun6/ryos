/** Desktops/laptops at or below this core count are treated as low-power. */
const LOW_POWER_MAX_CORES = 4;
/** Devices reporting at or below this much RAM (GB) are treated as low-power. */
const LOW_POWER_MAX_MEMORY_GB = 4;

let cachedLowPowerHardware: boolean | null = null;

/**
 * Lightweight, cached heuristic for weak hardware based on CPU core count and
 * (where exposed) device memory — the same core-count signal probed by
 * {@link checkShaderPerformance} at boot, but WITHOUT creating a WebGL context,
 * so it's cheap enough to call from component render.
 *
 * Used to drop animated shader backgrounds into their reduced-quality tier
 * (lower internal resolution / frame rate / buffer size) on weak machines —
 * including low-core desktops, not just phones.
 *
 * @returns {boolean} True if the device looks low-power.
 */
export function isLowPowerHardware(): boolean {
  if (cachedLowPowerHardware !== null) return cachedLowPowerHardware;
  if (typeof navigator === "undefined") return false; // SSR: decide on client

  const cores = navigator.hardwareConcurrency || 0;
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;

  const lowCores = cores > 0 && cores <= LOW_POWER_MAX_CORES;
  const lowMemory =
    typeof memory === "number" &&
    memory > 0 &&
    memory <= LOW_POWER_MAX_MEMORY_GB;

  cachedLowPowerHardware = lowCores || lowMemory;
  return cachedLowPowerHardware;
}

/**
 * Checks for basic performance indicators to estimate if the device
 * is likely capable of handling intensive shader effects smoothly.
 * This is a heuristic and not foolproof.
 *
 * Implemented with the raw WebGL API (instead of three.js) so this module —
 * which runs during store initialization on the critical boot path — does not
 * pull the ~600KB three chunk into the entry bundle.
 *
 * @returns {boolean} True if the device passes the checks, false otherwise.
 */
export function checkShaderPerformance(): boolean {
  console.log('[PerformanceCheck] Running checks...');

  // 1. Check CPU Cores
  const coreCount = navigator.hardwareConcurrency;
  const hasEnoughCores = coreCount && coreCount >= 8;
  console.log(`[PerformanceCheck] CPU Cores: ${coreCount} (Pass: ${hasEnoughCores})`);
  if (!hasEnoughCores) {
      return false; // Early exit if CPU core count is low
  }

  // 2. Check WebGL Capabilities (requires creating a temporary context)
  let maxAnisotropy = 0;
  let maxTextureSize = 0;
  let highpSupported = false;
  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    canvas = document.createElement('canvas');
    const attributes: WebGLContextAttributes = {
      powerPreference: 'high-performance',
    };
    gl =
      canvas.getContext('webgl2', attributes) ||
      canvas.getContext('webgl', attributes);
    if (!gl) {
      console.error('[PerformanceCheck] WebGL is not supported');
      return false;
    }

    // Same anisotropy lookup three.js performs (incl. vendor prefixes).
    const anisotropyExt =
      gl.getExtension('EXT_texture_filter_anisotropic') ||
      gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') ||
      gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    maxAnisotropy = anisotropyExt
      ? (gl.getParameter(anisotropyExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 0;

    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    // Check if high precision floats are supported (vertex + fragment),
    // mirroring three.js' WebGLCapabilities precision detection.
    const vertexHighp = gl.getShaderPrecisionFormat(
      gl.VERTEX_SHADER,
      gl.HIGH_FLOAT
    );
    const fragmentHighp = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT
    );
    highpSupported =
      (vertexHighp?.precision ?? 0) > 0 && (fragmentHighp?.precision ?? 0) > 0;

    console.log(`[PerformanceCheck] Max Anisotropy: ${maxAnisotropy}`);
    console.log(`[PerformanceCheck] Max Texture Size: ${maxTextureSize}`);
    console.log(`[PerformanceCheck] High Precision Supported: ${highpSupported}`);

  } catch (error) {
    console.error('[PerformanceCheck] Error creating WebGL context:', error);
    return false; // Cannot perform WebGL checks
  } finally {
    // Release the temporary context so it doesn't count against the
    // browser's active-context limit.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    canvas?.remove();
  }

  // Define thresholds (these might need tuning)
  const anisotropyThreshold = 8;
  const textureSizeThreshold = 8192;

  const passesGpuCheck = 
    maxAnisotropy >= anisotropyThreshold && 
    maxTextureSize >= textureSizeThreshold &&
    highpSupported;

  console.log(`[PerformanceCheck] GPU Checks Pass: ${passesGpuCheck}`);

  // Final decision: requires both CPU and GPU checks to pass
  const finalResult = hasEnoughCores && passesGpuCheck;
  console.log(`[PerformanceCheck] Final Result: ${finalResult}`);
  return finalResult;
}
