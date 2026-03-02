import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import type { AppId } from "@/config/appRegistry";
import type {
  LiveDesktopOperation,
  LiveDesktopSnapshot,
  LiveDesktopState,
} from "@/api/liveDesktop";
import { useChatsStore } from "@/stores/useChatsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useLiveDesktopSessionStore } from "@/stores/useLiveDesktopSessionStore";
import { onLiveDesktopJoinRequest } from "@/utils/appEventBus";
import {
  createLiveDesktopInstanceMapping,
  type LiveDesktopInstanceMapping,
} from "@/utils/liveDesktop/instanceMapping";
import { serializeLiveDesktopSnapshot } from "@/utils/liveDesktop/serializeWorkspace";
import { shouldApplyLiveDesktopSyncPayload } from "@/utils/liveDesktop/syncGuard";

const HEARTBEAT_INTERVAL_MS = 8000;

interface InstanceStateChangeEventDetail {
  instanceId: string;
  appId?: string;
  title?: string;
  initialData?: unknown;
  isOpen: boolean;
  isForeground: boolean;
  isMinimized?: boolean;
  changeType?:
    | "created"
    | "closed"
    | "focused"
    | "window-updated"
    | "minimized"
    | "restored";
}

interface InstanceWindowStateChangeEventDetail {
  instanceId: string;
  appId: AppId;
  title?: string;
  isForeground: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  initialData?: unknown;
}

function createOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSupportedAppId(value: string | undefined): value is AppId {
  return Boolean(value);
}

export function useLiveDesktopSync(): void {
  const username = useChatsStore((state) => state.username);
  const {
    currentSession,
    isHost,
    lastSyncPayload,
    joinSession,
    syncSession,
  } = useLiveDesktopSessionStore(
    useShallow((state) => ({
      currentSession: state.currentSession,
      isHost: state.isHost,
      lastSyncPayload: state.lastSyncPayload,
      joinSession: state.joinSession,
      syncSession: state.syncSession,
    }))
  );

  const canBroadcast = useMemo(
    () => Boolean(currentSession?.id && isHost),
    [currentSession?.id, isHost]
  );

  const mappingRef = useRef<LiveDesktopInstanceMapping>(
    createLiveDesktopInstanceMapping()
  );
  const lastAppliedOperationIdRef = useRef<string | null>(null);

  const getWorkspaceSnapshot = useCallback((): LiveDesktopSnapshot => {
    const appState = useAppStore.getState();
    return serializeLiveDesktopSnapshot(
      appState.instances,
      appState.instanceOrder,
      appState.foregroundInstanceId
    );
  }, []);

  const broadcastOperation = useCallback(
    async (operation: LiveDesktopOperation) => {
      if (!canBroadcast || !currentSession?.id) return;

      const snapshot = getWorkspaceSnapshot();
      const nextState: LiveDesktopState = {
        snapshot,
        lastOperation: {
          ...operation,
          snapshot: operation.type === "snapshot" ? snapshot : undefined,
        },
      };

      await syncSession(nextState);
    },
    [canBroadcast, currentSession?.id, getWorkspaceSnapshot, syncSession]
  );

  const applySnapshot = useCallback((snapshot: LiveDesktopSnapshot) => {
    const mapping = mappingRef.current;
    const seenHostIds = new Set<string>();

    for (const windowSnapshot of snapshot.windows) {
      seenHostIds.add(windowSnapshot.hostInstanceId);
      let localInstanceId = mapping.getLocalInstanceId(windowSnapshot.hostInstanceId);
      const localInstance = localInstanceId
        ? useAppStore.getState().instances[localInstanceId]
        : undefined;

      if (!localInstanceId || !localInstance) {
        const createdId = useAppStore.getState().launchApp(
          windowSnapshot.appId as AppId,
          windowSnapshot.initialData,
          windowSnapshot.title,
          true
        );
        mapping.setMapping(windowSnapshot.hostInstanceId, createdId);
        localInstanceId = createdId;
      }

      if (!localInstanceId) continue;

      if (windowSnapshot.position && windowSnapshot.size) {
        useAppStore.getState().updateInstanceWindowState(
          localInstanceId,
          windowSnapshot.position,
          windowSnapshot.size
        );
      }

      const currentInstance = useAppStore.getState().instances[localInstanceId];
      if (!currentInstance) continue;

      if (windowSnapshot.isMinimized && !currentInstance.isMinimized) {
        useAppStore.getState().minimizeInstance(localInstanceId);
      } else if (!windowSnapshot.isMinimized && currentInstance.isMinimized) {
        useAppStore.getState().restoreInstance(localInstanceId);
      }

      if (windowSnapshot.isForeground) {
        useAppStore.getState().bringInstanceToForeground(localInstanceId);
      }
    }

    for (const hostInstanceId of mapping.getHostInstanceIds()) {
      if (seenHostIds.has(hostInstanceId)) continue;
      const localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
      if (
        localInstanceId &&
        useAppStore.getState().instances[localInstanceId]?.isOpen
      ) {
        useAppStore.getState().closeAppInstance(localInstanceId);
      }
      mapping.removeMapping(hostInstanceId);
    }

    if (snapshot.foregroundHostInstanceId) {
      const localForegroundId = mapping.getLocalInstanceId(
        snapshot.foregroundHostInstanceId
      );
      if (localForegroundId) {
        useAppStore.getState().bringInstanceToForeground(localForegroundId);
      }
    }
  }, []);

  const applyOperation = useCallback(
    (operation: LiveDesktopOperation, snapshot: LiveDesktopSnapshot | null) => {
      const mapping = mappingRef.current;

      if (operation.type === "snapshot" && operation.snapshot) {
        applySnapshot(operation.snapshot);
        return;
      }

      if (snapshot) {
        // Keep windows aligned with host when available.
        applySnapshot(snapshot);
      }

      const hostInstanceId = operation.hostInstanceId;
      switch (operation.type) {
        case "app-launch": {
          if (!hostInstanceId || !isSupportedAppId(operation.appId)) return;
          let localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
          const existingInstance =
            localInstanceId
              ? useAppStore.getState().instances[localInstanceId]
              : undefined;

          if (!localInstanceId || !existingInstance?.isOpen) {
            localInstanceId = useAppStore.getState().launchApp(
              operation.appId,
              operation.initialData,
              operation.title,
              true
            );
            mapping.setMapping(hostInstanceId, localInstanceId);
          }

          if (operation.isMinimized) {
            useAppStore.getState().minimizeInstance(localInstanceId);
          }
          if (operation.isForeground) {
            useAppStore.getState().bringInstanceToForeground(localInstanceId);
          }
          return;
        }

        case "app-close": {
          if (!hostInstanceId) return;
          const localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
          if (localInstanceId) {
            useAppStore.getState().closeAppInstance(localInstanceId);
            mapping.removeMapping(hostInstanceId);
          }
          return;
        }

        case "app-focus": {
          if (!hostInstanceId) return;
          const localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
          if (localInstanceId) {
            useAppStore.getState().bringInstanceToForeground(localInstanceId);
          }
          return;
        }

        case "app-minimize": {
          if (!hostInstanceId) return;
          const localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
          if (localInstanceId) {
            useAppStore.getState().minimizeInstance(localInstanceId);
          }
          return;
        }

        case "app-restore": {
          if (!hostInstanceId) return;
          const localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
          if (localInstanceId) {
            useAppStore.getState().restoreInstance(localInstanceId);
            if (operation.isForeground) {
              useAppStore.getState().bringInstanceToForeground(localInstanceId);
            }
          }
          return;
        }

        case "window-update": {
          if (!hostInstanceId || !operation.position || !operation.size) return;
          const localInstanceId = mapping.getLocalInstanceId(hostInstanceId);
          if (!localInstanceId) return;
          useAppStore.getState().updateInstanceWindowState(
            localInstanceId,
            operation.position,
            operation.size
          );
          return;
        }

        default:
          return;
      }
    },
    [applySnapshot]
  );

  useEffect(() => {
    if (!currentSession) {
      mappingRef.current.clear();
      lastAppliedOperationIdRef.current = null;
      return;
    }

    if (isHost) return;
    if (!currentSession.state.snapshot) return;

    applySnapshot(currentSession.state.snapshot);
    const operationId = currentSession.state.lastOperation?.id;
    if (operationId) {
      lastAppliedOperationIdRef.current = operationId;
    }
  }, [applySnapshot, currentSession, isHost]);

  useEffect(() => {
    if (!currentSession || isHost || !lastSyncPayload) return;

    const operation = lastSyncPayload.state.lastOperation;
    const shouldApply = shouldApplyLiveDesktopSyncPayload({
      hasSession: Boolean(currentSession),
      isHost,
      username,
      syncedBy: lastSyncPayload.syncedBy,
      operationId: operation?.id,
      lastAppliedOperationId: lastAppliedOperationIdRef.current,
    });

    if (!operation || !shouldApply) return;

    applyOperation(operation, lastSyncPayload.state.snapshot);
    lastAppliedOperationIdRef.current = operation.id;
  }, [applyOperation, currentSession, isHost, lastSyncPayload, username]);

  useEffect(() => {
    if (!canBroadcast || !currentSession?.id) return;

    const handleInstanceStateChange = (event: Event) => {
      const detail = (event as CustomEvent<InstanceStateChangeEventDetail>).detail;
      if (!detail || !detail.instanceId) return;

      const operationBase = {
        id: createOperationId(),
        hostInstanceId: detail.instanceId,
        appId: detail.appId,
        title: detail.title,
        initialData: detail.initialData,
        isForeground: detail.isForeground,
        isMinimized: detail.isMinimized,
      };

      switch (detail.changeType) {
        case "created":
          if (!isSupportedAppId(detail.appId)) return;
          void broadcastOperation({
            ...operationBase,
            type: "app-launch",
            appId: detail.appId,
          });
          return;
        case "closed":
          void broadcastOperation({
            ...operationBase,
            type: "app-close",
          });
          return;
        case "focused":
          void broadcastOperation({
            ...operationBase,
            type: "app-focus",
          });
          return;
        case "minimized":
          void broadcastOperation({
            ...operationBase,
            type: "app-minimize",
          });
          return;
        case "restored":
          void broadcastOperation({
            ...operationBase,
            type: "app-restore",
          });
          return;
        default:
          return;
      }
    };

    const handleWindowStateChange = (event: Event) => {
      const detail = (event as CustomEvent<InstanceWindowStateChangeEventDetail>)
        .detail;
      if (!detail || !detail.instanceId) return;

      void broadcastOperation({
        id: createOperationId(),
        type: "window-update",
        hostInstanceId: detail.instanceId,
        appId: detail.appId,
        title: detail.title,
        initialData: detail.initialData,
        isForeground: detail.isForeground,
        isMinimized: detail.isMinimized,
        position: detail.position,
        size: detail.size,
      });
    };

    window.addEventListener(
      "instanceStateChange",
      handleInstanceStateChange as EventListener
    );
    window.addEventListener(
      "instanceWindowStateChange",
      handleWindowStateChange as EventListener
    );

    void broadcastOperation({
      id: createOperationId(),
      type: "snapshot",
      snapshot: getWorkspaceSnapshot(),
    });

    const heartbeat = window.setInterval(() => {
      void broadcastOperation({
        id: createOperationId(),
        type: "snapshot",
        snapshot: getWorkspaceSnapshot(),
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.removeEventListener(
        "instanceStateChange",
        handleInstanceStateChange as EventListener
      );
      window.removeEventListener(
        "instanceWindowStateChange",
        handleWindowStateChange as EventListener
      );
      window.clearInterval(heartbeat);
    };
  }, [broadcastOperation, canBroadcast, currentSession?.id, getWorkspaceSnapshot]);

  useEffect(() => {
    const unsubscribe = onLiveDesktopJoinRequest((event) => {
      const sessionId = event.detail.sessionId;
      if (!sessionId) return;

      if (!username) {
        toast.error("Login required", {
          description: "Set a username in Chats to join a Live Desktop session.",
        });
        return;
      }

      void joinSession(sessionId, username).then((result) => {
        if (!result.ok) {
          toast.error("Failed to join session", {
            description: result.error || "Please try again.",
          });
          return;
        }

        toast.success("Joined Live Desktop", {
          description: `Session ${sessionId} connected.`,
        });
      });
    });

    return unsubscribe;
  }, [joinSession, username]);
}
