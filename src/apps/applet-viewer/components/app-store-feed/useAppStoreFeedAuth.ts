import { useCallback, useEffect } from "react";
import {
  APPLET_AUTH_MESSAGE_TYPE,
} from "@/utils/appletAuthBridge";

export function useAppStoreFeedAuth(
  feedRef: React.RefObject<HTMLDivElement | null>,
  username: string | null | undefined,
  isAuthenticated: boolean,
  appletContents: Map<string, string>
) {
  const sendAuthPayload = useCallback(
    (target: Window | null | undefined) => {
      if (!target) return;
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
        console.warn("[AppStoreFeed] Failed to post auth payload:", error);
      }
    },
    [username]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
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

      const iframes = feedRef.current?.querySelectorAll<HTMLIFrameElement>(
        "iframe[data-ryos-trusted-applet='1']"
      );
      const frameWindows: Window[] = [];
      iframes?.forEach((iframe) => {
        if (iframe.contentWindow) {
          frameWindows.push(iframe.contentWindow);
        }
      });

      if (!frameWindows.includes(sourceWindow)) {
        return;
      }

      sendAuthPayload(sourceWindow);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [feedRef, sendAuthPayload]);

  useEffect(() => {
    const iframes = feedRef.current?.querySelectorAll<HTMLIFrameElement>(
      "iframe[data-ryos-trusted-applet='1']"
    );
    iframes?.forEach((iframe) => {
      sendAuthPayload(iframe.contentWindow || undefined);
    });
  }, [feedRef, username, isAuthenticated, sendAuthPayload, appletContents]);
}
