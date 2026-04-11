import * as THREE from 'three';

/**
 * Checks for basic performance indicators to estimate if the device
 * is likely capable of handling intensive shader effects smoothly.
 * This is a heuristic and not foolproof.
 *
 * @returns {boolean} True if the device passes the checks, false otherwise.
 */
export function checkShaderPerformance(): boolean {
  // Avoid blocking first paint / SSR / tests: if we can't access the browser
  // APIs we need, fall back to "off".
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // Cache result for this page session; WebGL context creation is expensive.
  const cacheKey = "__ryos_shader_perf_ok__";
  const cached = (window as unknown as Record<string, unknown>)[cacheKey];
  if (typeof cached === "boolean") return cached;

  const debug =
    new URLSearchParams(window.location.search).has("debugPerformanceCheck") ||
    (window as unknown as Record<string, unknown>).__RYOS_DEBUG_PERF__ === true;

  if (debug) {
    console.log('[PerformanceCheck] Running checks...');
  }

  // 1. Check CPU Cores
  const coreCount = navigator.hardwareConcurrency;
  const hasEnoughCores = coreCount && coreCount >= 8;
  if (debug) {
    console.log(
      `[PerformanceCheck] CPU Cores: ${coreCount} (Pass: ${hasEnoughCores})`
    );
  }
  if (!hasEnoughCores) {
    (window as unknown as Record<string, unknown>)[cacheKey] = false;
    return false; // Early exit if CPU core count is low
  }

  // 2. Check WebGL Capabilities (Requires creating a temporary renderer)
  let renderer: THREE.WebGLRenderer | null = null;
  let maxAnisotropy = 0;
  let maxTextureSize = 0;
  let highpSupported = false;

  try {
    renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
    maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    maxTextureSize = renderer.capabilities.maxTextureSize;
    // Check if high precision floats are supported in fragment shaders
    highpSupported = renderer.capabilities.precision === 'highp';

    if (debug) {
      console.log(`[PerformanceCheck] Max Anisotropy: ${maxAnisotropy}`);
      console.log(`[PerformanceCheck] Max Texture Size: ${maxTextureSize}`);
      console.log(`[PerformanceCheck] High Precision Supported: ${highpSupported}`);
    }

  } catch (error) {
    if (debug) {
      console.error('[PerformanceCheck] Error creating WebGL context:', error);
    }
    (window as unknown as Record<string, unknown>)[cacheKey] = false;
    return false; // Cannot perform WebGL checks
  } finally {
    // Ensure renderer is disposed if created
    renderer?.dispose();
  }

  // Define thresholds (these might need tuning)
  const anisotropyThreshold = 8;
  const textureSizeThreshold = 8192;

  const passesGpuCheck = 
    maxAnisotropy >= anisotropyThreshold && 
    maxTextureSize >= textureSizeThreshold &&
    highpSupported;

  if (debug) {
    console.log(`[PerformanceCheck] GPU Checks Pass: ${passesGpuCheck}`);
  }

  // Final decision: requires both CPU and GPU checks to pass
  const finalResult = hasEnoughCores && passesGpuCheck;
  if (debug) {
    console.log(`[PerformanceCheck] Final Result: ${finalResult}`);
  }
  (window as unknown as Record<string, unknown>)[cacheKey] = finalResult;
  return finalResult;
} 