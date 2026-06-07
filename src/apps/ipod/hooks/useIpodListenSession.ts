import { useEffect, useRef, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useListenSessionStore } from "@/stores/useListenSessionStore";
import { onAppUpdate } from "@/utils/appEventBus";
import type { IpodInitialData } from "../../base/types";

export interface UseIpodListenSessionOptions {
  isWindowOpen: boolean;
  initialData: IpodInitialData | undefined;
  instanceId: string | undefined;
  username: string | null | undefined;
  bringInstanceToForeground: (instanceId: string) => void;
  clearIpodInitialData: (instanceId: string) => void;
  processVideoId: (videoId: string) => Promise<void>;
  lastProcessedInitialDataRef: MutableRefObject<unknown>;
}

export function useIpodListenSession({
  isWindowOpen,
  initialData,
  instanceId,
  username,
  bringInstanceToForeground,
  clearIpodInitialData,
  processVideoId,
  lastProcessedInitialDataRef,
}: UseIpodListenSessionOptions) {
  const { t } = useTranslation();
  const lastProcessedListenSessionRef = useRef<string | null>(null);
  const joinListenSession = useListenSessionStore((s) => s.joinSession);

    useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      if (
        isWindowOpen &&
        initialData?.listenSessionId &&
        typeof initialData.listenSessionId === "string"
      ) {
        if (lastProcessedListenSessionRef.current === initialData.listenSessionId) return;

        const sessionIdToProcess = initialData.listenSessionId;
        timeoutId = setTimeout(() => {
          joinListenSession(sessionIdToProcess, username || undefined)
            .then((result) => {
              if (!result.ok) {
                toast.error(t("apps.ipod.dialogs.listenSessionJoinFailed"), {
                  description:
                    result.error || t("apps.ipod.dialogs.pleaseTryAgain"),
                });
              }
              if (instanceId) clearIpodInitialData(instanceId);
            })
            .catch((error) => {
              console.error(`[iPod] Error joining listen session ${sessionIdToProcess}:`, error);
            });
        }, 100);
        lastProcessedListenSessionRef.current = initialData.listenSessionId;
      }
      return () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };
    }, [
      isWindowOpen,
      initialData,
      joinListenSession,
      username,
      clearIpodInitialData,
      instanceId,
    ]);

    // Update app event handling
    useEffect(() => {
      return onAppUpdate((event) => {
        const updateInitialData = event.detail.initialData as
          | { videoId?: string; listenSessionId?: string }
          | undefined;

        if (
          event.detail.appId === "ipod" &&
          updateInitialData?.videoId &&
          (!event.detail.instanceId || event.detail.instanceId === instanceId)
        ) {
          if (lastProcessedInitialDataRef.current === updateInitialData) return;

          const videoId = updateInitialData.videoId;
          if (instanceId) {
            bringInstanceToForeground(instanceId);
          }
          processVideoId(videoId).catch((error) => {
            console.error(`Error processing videoId ${videoId}:`, error);
            toast.error(t("apps.ipod.dialogs.failedToLoadSharedTrack"), {
              description: t("apps.ipod.dialogs.sharedTrackVideoId", { videoId }),
            });
          });
          lastProcessedInitialDataRef.current = updateInitialData;
        }

        if (
          event.detail.appId === "ipod" &&
          updateInitialData?.listenSessionId &&
          (!event.detail.instanceId || event.detail.instanceId === instanceId)
        ) {
          const sessionId = updateInitialData.listenSessionId;
          if (lastProcessedListenSessionRef.current === sessionId) return;
          if (instanceId) {
            bringInstanceToForeground(instanceId);
          }
          joinListenSession(sessionId, username || undefined)
            .then((result) => {
              if (!result.ok) {
                toast.error(t("apps.ipod.dialogs.listenSessionJoinFailed"), {
                  description:
                    result.error || t("apps.ipod.dialogs.pleaseTryAgain"),
                });
              }
            })
            .catch((error) => {
              console.error(`[iPod] Error joining listen session ${sessionId}:`, error);
            });
          lastProcessedListenSessionRef.current = sessionId;
        }
      });
    }, [bringInstanceToForeground, instanceId, joinListenSession, processVideoId, username]);
}
