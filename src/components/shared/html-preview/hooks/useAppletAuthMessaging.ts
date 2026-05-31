import { useCallback, useEffect } from "react";
import {
  APPLET_AUTH_MESSAGE_TYPE,
  isTrustedAppletAuthor,
} from "@/utils/appletAuthBridge";
import { useChatsStore } from "@/stores/useChatsStore";
import { useEventListener } from "@/hooks/useEventListener";

export function useAppletAuthMessaging(
  appletCreatedBy: string | null | undefined,
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  fullscreenIframeRef: React.RefObject<HTMLIFrameElement | null>
) {
  const isTrustedApplet = isTrustedAppletAuthor(appletCreatedBy);
  const username = useChatsStore((state) => state.username);

  const sendAuthPayload = useCallback(
    (target: Window | null | undefined) => {
      if (!target) return;
      if (!isTrustedApplet) return;
      try {
        target.postMessage(
          {
            type: APPLET_AUTH_MESSAGE_TYPE,
            action: "response",
            payload: { username: username ?? null },
          },
          window.location.origin
        );
      } catch (error) {
        console.warn("[applet-html-preview] Failed to post auth payload:", error);
      }
    },
    [username, isTrustedApplet]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event?.data;
      if (
        !data ||
        data.type !== APPLET_AUTH_MESSAGE_TYPE ||
        data.action !== "request"
      ) {
        return;
      }

      if (event.origin !== window.location.origin) {
        return;
      }

      const sourceWindow = event.source as Window | null;
      if (!sourceWindow) {
        return;
      }

      const frameWindows: Window[] = [];
      if (iframeRef.current?.contentWindow) {
        frameWindows.push(iframeRef.current.contentWindow);
      }
      if (fullscreenIframeRef.current?.contentWindow) {
        frameWindows.push(fullscreenIframeRef.current.contentWindow);
      }

      if (!frameWindows.includes(sourceWindow)) {
        return;
      }

      sendAuthPayload(sourceWindow);
    },
    [sendAuthPayload, iframeRef, fullscreenIframeRef]
  );

  useEventListener("message", handleMessage);

  useEffect(() => {
    sendAuthPayload(iframeRef.current?.contentWindow);
    sendAuthPayload(fullscreenIframeRef.current?.contentWindow);
  }, [sendAuthPayload, iframeRef, fullscreenIframeRef]);

  return { isTrustedApplet, sendAuthPayload };
}
