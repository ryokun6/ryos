import { useEffect } from "react";
import { AppletBridgeHost } from "@/utils/appletAuthBridge";

export function useAppStoreFeedAuth(
  feedRef: React.RefObject<HTMLDivElement | null>,
  _username: string | null | undefined,
  _isAuthenticated: boolean,
  appletContents: Map<string, string>
) {
  useEffect(() => {
    const host = new AppletBridgeHost();
    const feed = feedRef.current;
    const handleLoad = (event: Event) => {
      if (!(event.target instanceof HTMLIFrameElement)) return;
      const iframe = event.target;
      host.handleIframeLoad(
        iframe.contentWindow,
        iframe.dataset.ryosTrustedApplet === "1"
          ? iframe.dataset.ryosAppletNonce || null
          : null
      );
    };
    feed?.addEventListener("load", handleLoad, true);

    const handleMessage = (event: MessageEvent) => {
      host.handleConnect(event);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      feed?.removeEventListener("load", handleLoad, true);
      host.invalidateAll();
    };
  }, [feedRef, appletContents]);
}
