import { usePerformanceTier } from "@/hooks/usePerformanceTier";

/**
 * True when animated shader backgrounds should run in their reduced-quality
 * tier (lower internal resolution / frame rate / backing-buffer size).
 *
 * This is the case for every device that isn't classified as a full-performance
 * machine — i.e. the `"reduced"` tier (phones, tablets, low-/mid-perf PCs) and
 * the `"off"` tier (when shaders are force-enabled on a weak device anyway).
 * See {@link usePerformanceTier}.
 */
export function useReducedGraphics(): boolean {
  return usePerformanceTier() !== "full";
}
