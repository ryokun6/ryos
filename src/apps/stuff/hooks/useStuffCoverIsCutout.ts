import { useEffect, useState } from "react";
import type { StuffCoverPresentation } from "../types";
import {
  detectCoverImageTransparency,
  getCachedCoverTransparency,
} from "../utils/stuffCoverCutout";

/**
 * Whether a cover should use the cutout stage.
 *
 * Explicit `coverPresentation: "cutout"` always wins. Otherwise, probe the
 * image once (cached by coverBlobId / src) for real transparency so PNG/WebP
 * cutouts display without a remove-background flag.
 */
export function useStuffCoverIsCutout(
  coverSrc: string | undefined,
  options: {
    coverPresentation?: StuffCoverPresentation;
    /** Prefer coverBlobId so cache survives object-URL churn. */
    cacheKey?: string;
  } = {}
): boolean {
  const explicitCutout = options.coverPresentation === "cutout";
  const src = coverSrc?.trim() || "";
  const cacheKey = (options.cacheKey?.trim() || src).trim();

  const [detected, setDetected] = useState(() => {
    if (explicitCutout || !src || !cacheKey) return false;
    return getCachedCoverTransparency(cacheKey) === true;
  });

  useEffect(() => {
    if (explicitCutout || !src) {
      setDetected(false);
      return;
    }

    const cached = getCachedCoverTransparency(cacheKey);
    if (cached !== undefined) {
      setDetected(cached);
      return;
    }

    let cancelled = false;
    void detectCoverImageTransparency(src, cacheKey).then((hasAlpha) => {
      if (!cancelled) setDetected(hasAlpha);
    });

    return () => {
      cancelled = true;
    };
  }, [explicitCutout, src, cacheKey]);

  return Boolean(src) && (explicitCutout || detected);
}
