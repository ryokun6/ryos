import { useEffect, useRef, useState } from "react";
import { extractHtmlContent } from "../../htmlPreviewUtils";
import { sanitizeHtmlForStream } from "../sanitizeHtmlForStream";

const STREAM_PREVIEW_THROTTLE_MS = 500;

export function useStreamPreview(htmlContent: string, isStreaming: boolean) {
  const [streamPreviewHtml, setStreamPreviewHtml] = useState("");
  const lastRenderAtRef = useRef(0);
  const lastExtractedRef = useRef("");
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always read the latest content from a ref so a scheduled trailing render
  // picks up everything streamed since it was scheduled.
  const latestContentRef = useRef(htmlContent);
  latestContentRef.current = htmlContent;

  useEffect(() => {
    if (!isStreaming) {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      lastRenderAtRef.current = 0;
      lastExtractedRef.current = "";
      setStreamPreviewHtml("");
      return;
    }

    const render = () => {
      lastRenderAtRef.current = Date.now();
      const { htmlContent: extracted } = extractHtmlContent(
        latestContentRef.current
      );
      // Skip the (DOMPurify + regex) sanitization pass when the extracted
      // HTML hasn't changed since the last render.
      if (extracted && extracted !== lastExtractedRef.current) {
        lastExtractedRef.current = extracted;
        setStreamPreviewHtml(sanitizeHtmlForStream(extracted));
      }
    };

    const elapsed = Date.now() - lastRenderAtRef.current;
    if (elapsed >= STREAM_PREVIEW_THROTTLE_MS) {
      render();
      return;
    }

    // Within the throttle window: schedule a trailing render so the final
    // chunks of a stream are never dropped (the previous leading-edge-only
    // gate could leave the preview stale until the next delta arrived).
    if (!trailingTimerRef.current) {
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null;
        render();
      }, STREAM_PREVIEW_THROTTLE_MS - elapsed);
    }
  }, [htmlContent, isStreaming]);

  useEffect(() => {
    return () => {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
      }
    };
  }, []);

  return streamPreviewHtml;
}
