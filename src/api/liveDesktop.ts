import { apiRequest, type ApiAuthContext } from "@/api/core";

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

export interface LiveDesktopSessionUser {
  username: string;
  joinedAt: number;
  isOnline: boolean;
}

export interface LiveDesktopSession {
  id: string;
  hostUsername: string;
  createdAt: number;
  lastSyncAt: number;
  users: LiveDesktopSessionUser[];
  state: LiveDesktopState;
}

export interface LiveDesktopSessionSummary {
  id: string;
  hostUsername: string;
  createdAt: number;
  participantCount: number;
  currentAction: LiveDesktopOperationType | null;
}

export async function fetchLiveDesktopSessions(): Promise<{
  sessions: LiveDesktopSessionSummary[];
}> {
  return apiRequest<{ sessions: LiveDesktopSessionSummary[] }>({
    path: "/api/live/sessions",
    method: "GET",
  });
}

export async function createLiveDesktopSession(
  auth: ApiAuthContext,
  username?: string
): Promise<{ session: LiveDesktopSession }> {
  return apiRequest<{ session: LiveDesktopSession }, { username?: string }>({
    path: "/api/live/sessions",
    method: "POST",
    auth,
    body: username ? { username } : {},
  });
}

export async function joinLiveDesktopSession(
  sessionId: string,
  payload: { username?: string },
  auth?: ApiAuthContext
): Promise<{ session: LiveDesktopSession }> {
  return apiRequest<{ session: LiveDesktopSession }, typeof payload>({
    path: `/api/live/sessions/${encodeURIComponent(sessionId)}/join`,
    method: "POST",
    auth,
    body: payload,
  });
}

export async function leaveLiveDesktopSession(
  sessionId: string,
  payload: { username?: string },
  auth?: ApiAuthContext
): Promise<{ success: boolean; session?: LiveDesktopSession }> {
  return apiRequest<{ success: boolean; session?: LiveDesktopSession }, typeof payload>({
    path: `/api/live/sessions/${encodeURIComponent(sessionId)}/leave`,
    method: "POST",
    auth,
    body: payload,
  });
}

export async function syncLiveDesktopSession(
  sessionId: string,
  payload: { username?: string; state: LiveDesktopState },
  auth: ApiAuthContext
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }, typeof payload>({
    path: `/api/live/sessions/${encodeURIComponent(sessionId)}/sync`,
    method: "POST",
    auth,
    body: payload,
  });
}
