import { useEffect, useRef, useState } from "react";
import { extractHtmlContent } from "../../htmlPreviewUtils";
import { sanitizeHtmlForStream } from "../sanitizeHtmlForStream";

export function useStreamPreview(htmlContent: string, isStreaming: boolean) {
  const [streamPreviewHtml, setStreamPreviewHtml] = useState("");
  const lastStreamRenderRef = useRef(0);

  useEffect(() => {
    if (isStreaming) {
      const now = Date.now();
      if (now - lastStreamRenderRef.current > 500) {
        lastStreamRenderRef.current = now;
        const { htmlContent: extracted } = extractHtmlContent(htmlContent);

        if (extracted && streamPreviewHtml !== extracted) {
          setStreamPreviewHtml(sanitizeHtmlForStream(extracted));
        }
      }
    } else {
      setStreamPreviewHtml("");
    }
  }, [htmlContent, isStreaming, streamPreviewHtml]);

  return streamPreviewHtml;
}
