import { useMemo, useRef } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { generateProcessedHtmlContent } from "../generateProcessedHtmlContent";

export function useProcessedHtml(
  htmlContent: string,
  normalizedBaseUrl: string | null,
  isTrustedApplet: boolean
) {
  const contentTimestamp = useRef(Date.now());
  const { isMacOSTheme: isMacOsXTheme } = useThemeFlags();

  const baseOptions = useMemo(
    () => ({
      htmlContent,
      contentTimestamp: contentTimestamp.current,
      normalizedBaseUrl,
      isMacOsXTheme,
      isTrustedApplet,
    }),
    [htmlContent, normalizedBaseUrl, isMacOsXTheme, isTrustedApplet]
  );

  const processedHtmlContent = useMemo(
    () =>
      generateProcessedHtmlContent({
        ...baseOptions,
        useFallbackFonts: false,
      }),
    [baseOptions]
  );

  const processedHtmlContentForSave = useMemo(
    () =>
      generateProcessedHtmlContent({
        ...baseOptions,
        useFallbackFonts: true,
      }),
    [baseOptions]
  );

  return { processedHtmlContent, processedHtmlContentForSave };
}
