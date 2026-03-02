/**
 * TypeScript types for Live Desktop sessions.
 */

import type { RealtimeSessionUser } from "../../_utils/realtime-session-types.js";

export type LiveDesktopOperationType =
  | "snapshot"
  | "app-launch"
  | "app-close"
  | "app-focus"
  | "app-minimize"
  | "app-restore"
  | "window-update";

export interface LiveDesktopWindowPosition {
  x: number;
  y: number;
}

export interface LiveDesktopWindowSize {
  width: number;
  height: number;
}

export interface LiveDesktopWindowSnapshot {
  hostInstanceId: string;
  appId: string;
  title?: string;
  isMinimized: boolean;
  isForeground: boolean;
  position?: LiveDesktopWindowPosition;
  size?: LiveDesktopWindowSize;
  initialData?: unknown;
}

export interface LiveDesktopSnapshot {
  windows: LiveDesktopWindowSnapshot[];
  foregroundHostInstanceId: string | null;
  timestamp: number;
}

export interface LiveDesktopOperation {
  id: string;
  type: LiveDesktopOperationType;
  hostInstanceId?: string;
  appId?: string;
  title?: string;
  isMinimized?: boolean;
  isForeground?: boolean;
  position?: LiveDesktopWindowPosition;
  size?: LiveDesktopWindowSize;
  initialData?: unknown;
  snapshot?: LiveDesktopSnapshot;
}

export interface LiveDesktopState {
  snapshot: LiveDesktopSnapshot | null;
  lastOperation: LiveDesktopOperation | null;
}

export type LiveDesktopSessionUser = RealtimeSessionUser;

export interface LiveDesktopSession {
  id: string;
  hostUsername: string;
  createdAt: number;
  lastSyncAt: number;
  users: LiveDesktopSessionUser[];
  state: LiveDesktopState;
}

// Request/response payloads
export interface CreateLiveSessionRequest {
  username: string;
}

export interface JoinLiveSessionRequest {
  username: string;
}

export interface LeaveLiveSessionRequest {
  username: string;
}

export interface SyncLiveSessionRequest {
  username: string;
  state: LiveDesktopState;
}

export interface LiveDesktopSessionSummary {
  id: string;
  hostUsername: string;
  createdAt: number;
  participantCount: number;
  currentAction: LiveDesktopOperationType | null;
}

// Pusher payloads
export interface LiveDesktopSyncPayload {
  state: LiveDesktopState;
  timestamp: number;
  syncedBy: string;
  participantCount: number;
}

export interface LiveDesktopUserPayload {
  username: string;
}
