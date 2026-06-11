import { useCallback, useMemo, useRef } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { generateProcessedHtmlContent } from "../generateProcessedHtmlContent";
import type { GenerateProcessedHtmlOptions } from "../generateProcessedHtmlContent";

type BaseOptions = Omit<GenerateProcessedHtmlOptions, "useFallbackFonts">;

export function useProcessedHtml(
  htmlContent: string,
  normalizedBaseUrl: string | null,
  isTrustedApplet: boolean,
  isStreaming: boolean = false
) {
  const contentTimestamp = useRef(Date.now());
  const { isMacOSTheme: isMacOsXTheme } = useThemeFlags();

  const baseOptions = useMemo<BaseOptions>(
    () => ({
      htmlContent,
      contentTimestamp: contentTimestamp.current,
      normalizedBaseUrl,
      isMacOsXTheme,
      isTrustedApplet,
    }),
    [htmlContent, normalizedBaseUrl, isMacOsXTheme, isTrustedApplet]
  );

  // While streaming, the iframe is not rendered and the preview uses the
  // lightweight sanitized stream path instead, so skip the expensive full
  // document scaffold. It would otherwise run on every throttled token
  // delta over an ever-growing HTML string and stall the main thread.
  const processedHtmlContent = useMemo(() => {
    if (isStreaming) return "";
    return generateProcessedHtmlContent({
      ...baseOptions,
      useFallbackFonts: false,
    });
  }, [baseOptions, isStreaming]);

  // The save variant is only needed when the user explicitly saves, so
  // compute it on demand (with caching) instead of on every content change.
  const saveCacheRef = useRef<{ key: BaseOptions; value: string } | null>(
    null
  );
  const getProcessedHtmlContentForSave = useCallback(() => {
    if (saveCacheRef.current && saveCacheRef.current.key === baseOptions) {
      return saveCacheRef.current.value;
    }
    const value = generateProcessedHtmlContent({
      ...baseOptions,
      useFallbackFonts: true,
    });
    saveCacheRef.current = { key: baseOptions, value };
    return value;
  }, [baseOptions]);

  return { processedHtmlContent, getProcessedHtmlContentForSave };
}
