import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  AppletBridgeHost,
  createAppletBridgeNonce,
  isTrustedAppletAuthor,
} from "@/utils/appletAuthBridge";
import { useEventListener } from "@/hooks/useEventListener";

export function useAppletAuthMessaging(
  appletCreatedBy: string | null | undefined,
  htmlContent: string
) {
  const isTrustedApplet = isTrustedAppletAuthor(appletCreatedBy);
  const bridgeHostRef = useRef<AppletBridgeHost | null>(null);
  if (!bridgeHostRef.current) bridgeHostRef.current = new AppletBridgeHost();
  const appletBridgeNonce = useMemo(
    () => (isTrustedApplet ? createAppletBridgeNonce() : null),
    [htmlContent, isTrustedApplet]
  );

  useLayoutEffect(() => {
    const host = bridgeHostRef.current;
    host?.prepareDocument(appletBridgeNonce);
    return () => host?.invalidateAll();
  }, [appletBridgeNonce]);

  const handleIframeLoad = useCallback(
    (target: Window | null | undefined) => {
      bridgeHostRef.current?.handleIframeLoad(target);
    },
    []
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!isTrustedApplet) return;
      bridgeHostRef.current?.handleConnect(event);
    },
    [isTrustedApplet]
  );

  useEventListener("message", handleMessage);

  return { isTrustedApplet, appletBridgeNonce, handleIframeLoad };
}
