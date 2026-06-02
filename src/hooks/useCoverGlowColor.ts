import { useEffect, useMemo } from "react";
import {
  normalizeCoverColor,
  resolveCoverGlowColor,
} from "@/apps/ipod/components/lyrics-display/colorUtils";
import { useCoverPaletteResult } from "@/hooks/useCoverPalette";

interface CoverGlowColorOptions {
  coverUrl: string | null | undefined;
  coverColor: string | null | undefined;
  enabled: boolean;
  onResolved?: (coverColor: string, coverUrl: string) => void;
}

export function shouldExtractCoverGlowColor(
  enabled: boolean,
  coverColor: string | null | undefined
): boolean {
  return enabled && !normalizeCoverColor(coverColor);
}

export function shouldNotifyCoverGlowColorResolved(
  shouldExtract: boolean,
  requestedCoverUrl: string | null | undefined,
  paletteResult: { source: string; coverUrl: string | null }
): boolean {
  return (
    shouldExtract &&
    paletteResult.source === "cover" &&
    Boolean(paletteResult.coverUrl) &&
    paletteResult.coverUrl === (requestedCoverUrl ?? null)
  );
}

export function useCoverGlowColor({
  coverUrl,
  coverColor,
  enabled,
  onResolved,
}: CoverGlowColorOptions): string {
  const cachedCoverColor = useMemo(
    () => normalizeCoverColor(coverColor),
    [coverColor]
  );
  const shouldExtract = shouldExtractCoverGlowColor(enabled, coverColor);
  const paletteResult = useCoverPaletteResult(
    shouldExtract ? (coverUrl ?? null) : null
  );
  const resolvedColor = useMemo(
    () => cachedCoverColor ?? resolveCoverGlowColor(paletteResult.palette),
    [cachedCoverColor, paletteResult.palette]
  );

  useEffect(() => {
    if (
      shouldNotifyCoverGlowColorResolved(shouldExtract, coverUrl, paletteResult)
    ) {
      const resolvedCoverUrl = paletteResult.coverUrl;
      if (resolvedCoverUrl) {
        onResolved?.(resolvedColor, resolvedCoverUrl);
      }
    }
  }, [
    coverUrl,
    onResolved,
    paletteResult.coverUrl,
    paletteResult.source,
    resolvedColor,
    shouldExtract,
  ]);

  return resolvedColor;
}
