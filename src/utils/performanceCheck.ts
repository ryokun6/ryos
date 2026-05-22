/**
 * Checks for basic performance indicators to estimate if the device
 * is likely capable of handling intensive shader effects smoothly.
 * This is a heuristic and not foolproof.
 *
 * @returns {boolean} True if the device passes the checks, false otherwise.
 */
export async function checkShaderPerformance(): Promise<boolean> {
  console.log('[PerformanceCheck] Running checks...');

  // 1. Check CPU Cores
  const coreCount = navigator.hardwareConcurrency;
  const hasEnoughCores = coreCount && coreCount >= 8;
  console.log(`[PerformanceCheck] CPU Cores: ${coreCount} (Pass: ${hasEnoughCores})`);
  if (!hasEnoughCores) {
      return false; // Early exit if CPU core count is low
  }

  // 2. Check WebGL Capabilities (Requires creating a temporary renderer)
  let renderer: import('three').WebGLRenderer | null = null;
  let maxAnisotropy = 0;
  let maxTextureSize = 0;
  let highpSupported = false;

  try {
    const THREE = await import('three');
    renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
    maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    maxTextureSize = renderer.capabilities.maxTextureSize;
    // Check if high precision floats are supported in fragment shaders
    highpSupported = renderer.capabilities.precision === 'highp';

    console.log(`[PerformanceCheck] Max Anisotropy: ${maxAnisotropy}`);
    console.log(`[PerformanceCheck] Max Texture Size: ${maxTextureSize}`);
    console.log(`[PerformanceCheck] High Precision Supported: ${highpSupported}`);

  } catch (error) {
    console.error('[PerformanceCheck] Error creating WebGL context:', error);
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

  console.log(`[PerformanceCheck] GPU Checks Pass: ${passesGpuCheck}`);

  // Final decision: requires both CPU and GPU checks to pass
  const finalResult = hasEnoughCores && passesGpuCheck;
  console.log(`[PerformanceCheck] Final Result: ${finalResult}`);
  return finalResult;
} 