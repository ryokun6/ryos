import { useEffect } from "react";
import { handleAppletBridgeMessage } from "@/utils/appletAuthBridge";

export function useAppStoreFeedAuth(
  feedRef: React.RefObject<HTMLDivElement | null>,
  _username: string | null | undefined,
  _isAuthenticated: boolean,
  appletContents: Map<string, string>
) {
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const sourceWindow = event.source as Window | null;
      const iframes = feedRef.current?.querySelectorAll<HTMLIFrameElement>(
        "iframe[data-ryos-trusted-applet='1']"
      );
      const frameWindows: Window[] = [];
      iframes?.forEach((iframe) => {
        if (iframe.contentWindow) {
          frameWindows.push(iframe.contentWindow);
        }
      });

      if (!sourceWindow) return;
      void handleAppletBridgeMessage({
        event,
        trustedWindows: frameWindows,
      });
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [feedRef, appletContents]);
}
