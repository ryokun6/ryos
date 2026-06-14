import { useEffect, useRef } from "react";
import { onAppUpdate } from "@/utils/appEventBus";

/**
 * Shared deep-link / shared-URL plumbing for media apps (iPod + Karaoke).
 *
 * Both apps handle the same three flows identically except for app-specific
 * bodies (which library/setter a shared track lands in, toast copy, etc.):
 * 1. Initial `initialData.videoId` — add/play a shared track on open.
 * 2. Initial `initialData.listenSessionId` — join a listen session on open.
 * 3. `onAppUpdate` — same two flows when the app is already open.
 *
 * The app-specific work is passed in as callbacks; only the effect scaffolding
 * (dedupe guards, the 100ms defer on open, instance matching, foregrounding,
 * and clearing initial data) lives here.
 */

export interface MediaDeepLinkInitialData {
  videoId?: string;
  listenSessionId?: string;
}

export interface ListenSessionJoinResult {
  ok: boolean;
  error?: string;
}

export interface UseMediaDeepLinksParams {
  appId: string;
  isWindowOpen: boolean;
  initialData: MediaDeepLinkInitialData | undefined;
  instanceId: string | undefined;
  username: string | null | undefined;
  clearInitialData: (instanceId: string) => void;
  bringInstanceToForeground: (instanceId: string) => void;
  /** Add/select + (maybe) play the shared video. App owns library routing. */
  processVideoId: (videoId: string) => Promise<void>;
  joinListenSession: (
    sessionId: string,
    username?: string
  ) => Promise<ListenSessionJoinResult>;
  /** Toast on a failed join (copy differs per app). */
  onJoinError: (result: ListenSessionJoinResult) => void;
  /** Toast on a failed `onAppUpdate` video load (copy differs per app). */
  onVideoIdUpdateError: (videoId: string, error: unknown) => void;
  /**
   * Runs (only while the window is open) when there is no initial `videoId`.
   * Karaoke uses this to reset to the first track when the current song no
   * longer exists; iPod omits it.
   */
  onNoInitialVideoId?: () => void;
}

export function useMediaDeepLinks({
  appId,
  isWindowOpen,
  initialData,
  instanceId,
  username,
  clearInitialData,
  bringInstanceToForeground,
  processVideoId,
  joinListenSession,
  onJoinError,
  onVideoIdUpdateError,
  onNoInitialVideoId,
}: UseMediaDeepLinksParams): void {
  const lastProcessedInitialDataRef = useRef<unknown>(null);
  const lastProcessedListenSessionRef = useRef<string | null>(null);

  // 1. Initial shared track (videoId) on open.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (
      isWindowOpen &&
      initialData?.videoId &&
      typeof initialData.videoId === "string"
    ) {
      if (lastProcessedInitialDataRef.current === initialData) return;

      const videoIdToProcess = initialData.videoId;
      timeoutId = setTimeout(() => {
        processVideoId(videoIdToProcess)
          .then(() => {
            if (instanceId) clearInitialData(instanceId);
          })
          .catch((error) => {
            console.error(
              `[${appId}] Error processing initial videoId ${videoIdToProcess}:`,
              error
            );
          });
      }, 100);
      lastProcessedInitialDataRef.current = initialData;
    } else if (isWindowOpen) {
      onNoInitialVideoId?.();
    }
    return () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    appId,
    isWindowOpen,
    initialData,
    instanceId,
    processVideoId,
    clearInitialData,
    onNoInitialVideoId,
  ]);

  // 2. Initial listen-session join on open.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (
      isWindowOpen &&
      initialData?.listenSessionId &&
      typeof initialData.listenSessionId === "string"
    ) {
      if (lastProcessedListenSessionRef.current === initialData.listenSessionId)
        return;

      const sessionIdToProcess = initialData.listenSessionId;
      timeoutId = setTimeout(() => {
        joinListenSession(sessionIdToProcess, username || undefined)
          .then((result) => {
            if (!result.ok) onJoinError(result);
            if (instanceId) clearInitialData(instanceId);
          })
          .catch((error) => {
            console.error(
              `[${appId}] Error joining listen session ${sessionIdToProcess}:`,
              error
            );
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
    appId,
    isWindowOpen,
    initialData,
    instanceId,
    username,
    joinListenSession,
    clearInitialData,
    onJoinError,
  ]);

  // 3. `onAppUpdate` — same two flows when the app is already open.
  useEffect(() => {
    return onAppUpdate((event) => {
      const updateInitialData = event.detail.initialData as
        | MediaDeepLinkInitialData
        | undefined;
      const matchesInstance =
        !event.detail.instanceId || event.detail.instanceId === instanceId;

      if (
        event.detail.appId === appId &&
        updateInitialData?.videoId &&
        matchesInstance
      ) {
        if (lastProcessedInitialDataRef.current === updateInitialData) return;

        const videoId = updateInitialData.videoId;
        if (instanceId) bringInstanceToForeground(instanceId);
        processVideoId(videoId).catch((error) => {
          console.error(`[${appId}] Error processing videoId ${videoId}:`, error);
          onVideoIdUpdateError(videoId, error);
        });
        lastProcessedInitialDataRef.current = updateInitialData;
      }

      if (
        event.detail.appId === appId &&
        updateInitialData?.listenSessionId &&
        matchesInstance
      ) {
        const sessionId = updateInitialData.listenSessionId;
        if (lastProcessedListenSessionRef.current === sessionId) return;
        if (instanceId) bringInstanceToForeground(instanceId);
        joinListenSession(sessionId, username || undefined)
          .then((result) => {
            if (!result.ok) onJoinError(result);
          })
          .catch((error) => {
            console.error(
              `[${appId}] Error joining listen session ${sessionId}:`,
              error
            );
          });
        lastProcessedListenSessionRef.current = sessionId;
      }
    });
  }, [
    appId,
    instanceId,
    username,
    processVideoId,
    joinListenSession,
    bringInstanceToForeground,
    onJoinError,
    onVideoIdUpdateError,
  ]);
}
