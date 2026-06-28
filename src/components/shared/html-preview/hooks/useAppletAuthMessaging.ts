import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  AppletBridgeHost,
  createAppletBridgeNonce,
  createAppletStorageKey,
  isAppletAiCapabilityAllowed,
  readAppletStorageSnapshot,
  type AppletStorageSnapshot,
} from "@/utils/appletAuthBridge";
import { useEventListener } from "@/hooks/useEventListener";

export function useAppletAuthMessaging(
  appletCreatedBy: string | null | undefined,
  htmlContent: string,
  hasServerGeneratedProvenance: boolean,
  storageIdentity?: string | null
) {
  const isTrustedApplet = isAppletAiCapabilityAllowed(
    appletCreatedBy,
    hasServerGeneratedProvenance
  );
  const bridgeHostRef = useRef<AppletBridgeHost | null>(null);
  if (!bridgeHostRef.current) bridgeHostRef.current = new AppletBridgeHost();
  const appletBridgeNonce = useMemo(
    () => {
      void htmlContent;
      return createAppletBridgeNonce();
    },
    [htmlContent]
  );
  const appletStorageKey = useMemo(
    () => (storageIdentity ? createAppletStorageKey(storageIdentity) : null),
    [storageIdentity]
  );
  const appletStorageSnapshot = useMemo<AppletStorageSnapshot>(
    () => {
      void appletBridgeNonce;
      return bridgeHostRef.current?.getStorageSnapshot(appletStorageKey) ??
        (appletStorageKey
          ? readAppletStorageSnapshot(appletStorageKey)
          : {});
    },
    [appletBridgeNonce, appletStorageKey]
  );

  useLayoutEffect(() => {
    const host = bridgeHostRef.current;
    host?.prepareDocument(
      appletBridgeNonce,
      appletStorageKey,
      isTrustedApplet,
      appletStorageSnapshot
    );
    return () => host?.invalidateAll();
  }, [
    appletBridgeNonce,
    appletStorageKey,
    appletStorageSnapshot,
    isTrustedApplet,
  ]);

  const handleIframeLoad = useCallback(
    (target: Window | null | undefined) => {
      bridgeHostRef.current?.handleIframeLoad(target);
    },
    []
  );
  const armIframeDocument = useCallback(
    (target: Window | null | undefined) => {
      bridgeHostRef.current?.armWindowForDocument(target);
    },
    []
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      bridgeHostRef.current?.handleConnect(event);
    },
    []
  );

  useEventListener("message", handleMessage);

  return {
    isTrustedApplet,
    appletBridgeNonce,
    appletStorageSnapshot,
    armIframeDocument,
    handleIframeLoad,
  };
}
