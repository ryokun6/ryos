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
    if (shouldExtract && paletteResult.source === "cover" && paletteResult.coverUrl) {
      onResolved?.(resolvedColor, paletteResult.coverUrl);
    }
  }, [
    onResolved,
    paletteResult.coverUrl,
    paletteResult.source,
    resolvedColor,
    shouldExtract,
  ]);

  return resolvedColor;
}
