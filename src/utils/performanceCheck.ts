/**
 * Checks for basic performance indicators to estimate if the device
 * is likely capable of handling intensive shader effects smoothly.
 * This is a heuristic and not foolproof.
 *
 * Uses a raw WebGL context to probe GPU capabilities directly. Previously this
 * pulled in the full `three` library (~225KB gzip) at module load time via the
 * display-settings store, which is on the eager boot path — three.js is only
 * needed by the Virtual PC app, so we avoid loading it on every page visit.
 *
 * @returns {boolean} True if the device passes the checks, false otherwise.
 */
export function checkShaderPerformance(): boolean {
  // 1. Check CPU Cores
  const coreCount = navigator.hardwareConcurrency;
  const hasEnoughCores = !!coreCount && coreCount >= 8;
  if (!hasEnoughCores) {
    return false; // Early exit if CPU core count is low
  }

  // 2. Check WebGL Capabilities using a throwaway context.
  let maxAnisotropy = 0;
  let maxTextureSize = 0;
  let highpSupported = false;

  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;

  try {
    canvas = document.createElement("canvas");
    gl =
      (canvas.getContext("webgl2", {
        powerPreference: "high-performance",
      }) as WebGL2RenderingContext | null) ||
      (canvas.getContext("webgl", {
        powerPreference: "high-performance",
      }) as WebGLRenderingContext | null) ||
      (canvas.getContext(
        "experimental-webgl"
      ) as WebGLRenderingContext | null);

    if (!gl) {
      return false; // No WebGL available
    }

    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    // Anisotropic filtering is an extension; mirrors three.js getMaxAnisotropy().
    const anisoExt =
      gl.getExtension("EXT_texture_filter_anisotropic") ||
      gl.getExtension("MOZ_EXT_texture_filter_anisotropic") ||
      gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
    if (anisoExt) {
      maxAnisotropy = gl.getParameter(
        anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT
      ) as number;
    }

    // High precision float support in fragment shaders.
    const highpFloat = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT
    );
    highpSupported = !!highpFloat && highpFloat.precision > 0;
  } catch (error) {
    console.error("[PerformanceCheck] Error creating WebGL context:", error);
    return false; // Cannot perform WebGL checks
  } finally {
    // Proactively release the context so the throwaway canvas can be GC'd.
    const loseContext = gl?.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    canvas = null;
  }

  // Define thresholds (these might need tuning)
  const anisotropyThreshold = 8;
  const textureSizeThreshold = 8192;

  const passesGpuCheck =
    maxAnisotropy >= anisotropyThreshold &&
    maxTextureSize >= textureSizeThreshold &&
    highpSupported;

  return hasEnoughCores && passesGpuCheck;
}
