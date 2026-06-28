import { useCallback, useEffect } from "react";
import {
  handleAppletBridgeMessage,
  isTrustedAppletAuthor,
} from "@/utils/appletAuthBridge";
import { useEventListener } from "@/hooks/useEventListener";

export function useAppletAuthMessaging(
  appletCreatedBy: string | null | undefined,
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  fullscreenIframeRef: React.RefObject<HTMLIFrameElement | null>
) {
  const isTrustedApplet = isTrustedAppletAuthor(appletCreatedBy);

  const sendAuthPayload = useCallback(
    (_target: Window | null | undefined) => {},
    []
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const sourceWindow = event.source as Window | null;
      const frameWindows: Window[] = [];
      if (iframeRef.current?.contentWindow) {
        frameWindows.push(iframeRef.current.contentWindow);
      }
      if (fullscreenIframeRef.current?.contentWindow) {
        frameWindows.push(fullscreenIframeRef.current.contentWindow);
      }

      if (!isTrustedApplet || !sourceWindow) return;
      void handleAppletBridgeMessage({
        event,
        trustedWindows: frameWindows,
      });
    },
    [isTrustedApplet, iframeRef, fullscreenIframeRef]
  );

  useEventListener("message", handleMessage);

  useEffect(() => {
    sendAuthPayload(iframeRef.current?.contentWindow);
    sendAuthPayload(fullscreenIframeRef.current?.contentWindow);
  }, [sendAuthPayload, iframeRef, fullscreenIframeRef]);

  return { isTrustedApplet, sendAuthPayload };
}
